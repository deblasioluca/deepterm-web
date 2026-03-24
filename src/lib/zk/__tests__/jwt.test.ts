import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma before importing jwt module
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organizationUser: { findMany: vi.fn() },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyAccessToken,
  createTokenPair,
  refreshTokenPair,
  revokeAllTokens,
  revokeToken,
  cleanupExpiredTokens,
} from '../jwt';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as unknown as {
  organizationUser: { findMany: ReturnType<typeof vi.fn> };
  refreshToken: {
    create: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// generateAccessToken / verifyAccessToken round-trip
// ---------------------------------------------------------------------------

describe('generateAccessToken', () => {
  it('returns a non-empty string', () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com' });
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('includes userId and email in payload', () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded).not.toBeNull();
    expect(decoded!.userId).toBe('u1');
    expect(decoded!.email).toBe('a@b.com');
  });

  it('includes optional deviceId and orgIds', () => {
    const token = generateAccessToken({
      userId: 'u1',
      email: 'a@b.com',
      deviceId: 'd1',
      orgIds: ['org1', 'org2'],
    });
    const decoded = verifyAccessToken(token);
    expect(decoded!.deviceId).toBe('d1');
    expect(decoded!.orgIds).toEqual(['org1', 'org2']);
  });

  it('sets iat and exp claims', () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded!.iat).toBeDefined();
    expect(decoded!.exp).toBeDefined();
    // exp should be ~15 minutes after iat
    expect(decoded!.exp! - decoded!.iat!).toBeCloseTo(15 * 60, -1);
  });
});

describe('verifyAccessToken', () => {
  it('returns null for empty string', () => {
    expect(verifyAccessToken('')).toBeNull();
  });

  it('returns null for garbage token', () => {
    expect(verifyAccessToken('not.a.valid.token')).toBeNull();
  });

  it('returns null for tampered token', () => {
    const token = generateAccessToken({ userId: 'u1', email: 'a@b.com' });
    const tampered = token.slice(0, -5) + 'XXXXX';
    expect(verifyAccessToken(tampered)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generateRefreshToken
// ---------------------------------------------------------------------------

describe('generateRefreshToken', () => {
  it('returns a non-empty string', () => {
    const token = generateRefreshToken();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
  });

  it('generates unique tokens on each call', () => {
    const t1 = generateRefreshToken();
    const t2 = generateRefreshToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// hashRefreshToken
// ---------------------------------------------------------------------------

describe('hashRefreshToken', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = hashRefreshToken('sometoken');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    const h1 = hashRefreshToken('abc');
    const h2 = hashRefreshToken('abc');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    const h1 = hashRefreshToken('abc');
    const h2 = hashRefreshToken('def');
    expect(h1).not.toBe(h2);
  });
});

// ---------------------------------------------------------------------------
// createTokenPair
// ---------------------------------------------------------------------------

describe('createTokenPair', () => {
  it('returns accessToken, refreshToken, and expiresIn', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    const pair = await createTokenPair('u1', 'a@b.com');
    expect(pair.accessToken).toBeDefined();
    expect(pair.refreshToken).toBeDefined();
    expect(pair.expiresIn).toBe(15 * 60);
  });

  it('stores hashed refresh token in DB', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    const pair = await createTokenPair('u1', 'a@b.com');
    expect(mockPrisma.refreshToken.create).toHaveBeenCalledOnce();

    const createCall = mockPrisma.refreshToken.create.mock.calls[0][0];
    expect(createCall.data.userId).toBe('u1');
    expect(createCall.data.tokenHash).toBeDefined();
    // Stored hash should match hashing the returned refresh token
    expect(createCall.data.tokenHash).toBe(hashRefreshToken(pair.refreshToken));
  });

  it('revokes existing device tokens when deviceId provided', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    await createTokenPair('u1', 'a@b.com', 'd1');
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', deviceId: 'd1', isRevoked: false },
    });
  });

  it('uses provided orgIds instead of querying DB', async () => {
    mockPrisma.refreshToken.create.mockResolvedValue({ id: 'rt1' });

    const pair = await createTokenPair('u1', 'a@b.com', undefined, ['org1']);
    // Should NOT query organizationUser since orgIds were provided
    expect(mockPrisma.organizationUser.findMany).not.toHaveBeenCalled();

    const decoded = verifyAccessToken(pair.accessToken);
    expect(decoded!.orgIds).toEqual(['org1']);
  });
});

// ---------------------------------------------------------------------------
// revokeAllTokens
// ---------------------------------------------------------------------------

describe('revokeAllTokens', () => {
  it('marks all tokens as revoked for user', async () => {
    mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

    await revokeAllTokens('u1');
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      data: { isRevoked: true },
    });
  });
});

// ---------------------------------------------------------------------------
// revokeToken
// ---------------------------------------------------------------------------

describe('revokeToken', () => {
  it('returns true when token exists', async () => {
    mockPrisma.refreshToken.update.mockResolvedValue({ id: 'rt1' });

    const result = await revokeToken('mytoken');
    expect(result).toBe(true);
    expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
      where: { tokenHash: hashRefreshToken('mytoken') },
      data: { isRevoked: true },
    });
  });

  it('returns false when token does not exist', async () => {
    mockPrisma.refreshToken.update.mockRejectedValue(new Error('Not found'));

    const result = await revokeToken('nonexistent');
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// cleanupExpiredTokens
// ---------------------------------------------------------------------------

describe('cleanupExpiredTokens', () => {
  it('deletes expired and revoked tokens', async () => {
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

    const count = await cleanupExpiredTokens();
    expect(count).toBe(5);
    expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledOnce();
  });
});
