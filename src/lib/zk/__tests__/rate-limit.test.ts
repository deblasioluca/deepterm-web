import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    zKUser: { findUnique: vi.fn() },
    rateLimitEntry: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import {
  getRateLimitKey,
  checkRateLimit,
  resetRateLimit,
  cleanupRateLimits,
  rateLimitResponse,
  getClientIP,
} from '../rate-limit';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const mockPrisma = prisma as unknown as {
  zKUser: { findUnique: ReturnType<typeof vi.fn> };
  rateLimitEntry: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// getRateLimitKey
// ---------------------------------------------------------------------------

describe('getRateLimitKey', () => {
  it('concatenates lowercase email and IP', () => {
    expect(getRateLimitKey('Alice@Example.com', '1.2.3.4')).toBe('alice@example.com:1.2.3.4');
  });

  it('handles empty email', () => {
    expect(getRateLimitKey('', '1.2.3.4')).toBe(':1.2.3.4');
  });
});

// ---------------------------------------------------------------------------
// checkRateLimit
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  it('allows first request and creates entry', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);
    mockPrisma.rateLimitEntry.findUnique.mockResolvedValue(null);
    const now = new Date();
    mockPrisma.rateLimitEntry.create.mockResolvedValue({
      key: 'a@b.com:1.2.3.4',
      attempts: 1,
      windowStart: now,
      blockedUntil: null,
    });

    const result = await checkRateLimit('a@b.com:1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4); // MAX_ATTEMPTS(5) - 1
    expect(mockPrisma.rateLimitEntry.create).toHaveBeenCalledOnce();
  });

  it('blocks when attempts exceed maximum', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);
    const now = new Date();
    mockPrisma.rateLimitEntry.findUnique.mockResolvedValue({
      key: 'a@b.com:1.2.3.4',
      attempts: 5,
      windowStart: now,
      blockedUntil: null,
    });
    mockPrisma.rateLimitEntry.upsert.mockResolvedValue({});

    const result = await checkRateLimit('a@b.com:1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeDefined();
  });

  it('blocks when user is currently blocked', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);
    const futureDate = new Date(Date.now() + 60000);
    mockPrisma.rateLimitEntry.findUnique.mockResolvedValue({
      key: 'a@b.com:1.2.3.4',
      attempts: 6,
      windowStart: new Date(),
      blockedUntil: futureDate,
    });

    const result = await checkRateLimit('a@b.com:1.2.3.4');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('resets window when expired', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);
    const oldWindow = new Date(Date.now() - 20 * 60 * 1000); // 20 min ago
    mockPrisma.rateLimitEntry.findUnique.mockResolvedValue({
      key: 'a@b.com:1.2.3.4',
      attempts: 5,
      windowStart: oldWindow,
      blockedUntil: null,
    });
    mockPrisma.rateLimitEntry.upsert.mockResolvedValue({
      key: 'a@b.com:1.2.3.4',
      attempts: 1,
      windowStart: new Date(),
      blockedUntil: null,
    });

    const result = await checkRateLimit('a@b.com:1.2.3.4');
    expect(result.allowed).toBe(true);
  });

  it('bypasses rate limit for exempt users', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({ rateLimitExempt: true });

    const result = await checkRateLimit('exempt@b.com:1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// resetRateLimit
// ---------------------------------------------------------------------------

describe('resetRateLimit', () => {
  it('deletes the entry', async () => {
    mockPrisma.rateLimitEntry.delete.mockResolvedValue({});
    await resetRateLimit('a@b.com:1.2.3.4');
    expect(mockPrisma.rateLimitEntry.delete).toHaveBeenCalledWith({
      where: { key: 'a@b.com:1.2.3.4' },
    });
  });

  it('does not throw when entry does not exist', async () => {
    mockPrisma.rateLimitEntry.delete.mockRejectedValue(new Error('Not found'));
    await expect(resetRateLimit('nonexistent')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// cleanupRateLimits
// ---------------------------------------------------------------------------

describe('cleanupRateLimits', () => {
  it('returns count of deleted entries', async () => {
    mockPrisma.rateLimitEntry.deleteMany.mockResolvedValue({ count: 3 });
    const count = await cleanupRateLimits();
    expect(count).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// rateLimitResponse
// ---------------------------------------------------------------------------

describe('rateLimitResponse', () => {
  it('returns 429 with Retry-After header', () => {
    const result = {
      allowed: false,
      remaining: 0,
      resetAt: new Date('2026-01-01T00:00:00Z'),
      retryAfter: 30,
    };
    const res = rateLimitResponse(result);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
  });
});

// ---------------------------------------------------------------------------
// getClientIP
// ---------------------------------------------------------------------------

describe('getClientIP', () => {
  function makeReq(headers: Record<string, string> = {}): NextRequest {
    return new NextRequest('http://localhost/test', { headers: new Headers(headers) });
  }

  it('extracts IP from x-forwarded-for', () => {
    expect(getClientIP(makeReq({ 'x-forwarded-for': '5.6.7.8, 1.2.3.4' }))).toBe('5.6.7.8');
  });

  it('extracts IP from x-real-ip', () => {
    expect(getClientIP(makeReq({ 'x-real-ip': '9.8.7.6' }))).toBe('9.8.7.6');
  });

  it('extracts IP from cf-connecting-ip', () => {
    expect(getClientIP(makeReq({ 'cf-connecting-ip': '10.0.0.1' }))).toBe('10.0.0.1');
  });

  it('falls back to 127.0.0.1', () => {
    expect(getClientIP(makeReq())).toBe('127.0.0.1');
  });

  it('prefers x-forwarded-for over x-real-ip', () => {
    expect(getClientIP(makeReq({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
    }))).toBe('1.1.1.1');
  });
});
