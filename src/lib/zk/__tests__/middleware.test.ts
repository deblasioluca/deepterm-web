import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// Mock dependencies
vi.mock('../jwt', () => ({
  verifyAccessToken: vi.fn(),
}));

vi.mock('../rate-limit', () => ({
  getClientIP: vi.fn().mockReturnValue('1.2.3.4'),
}));

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    zKUser: { findUnique: vi.fn() },
    organizationUser: { findMany: vi.fn() },
  },
}));

import {
  getAuthFromRequest,
  getAuthFromRequestOrSession,
  withAuth,
  requireOrgMembership,
  validateRequiredFields,
  errorResponse,
  successResponse,
  addCorsHeaders,
  handleCorsPreflightRequest,
  isSessionOnlyAuth,
  type SessionOnlyAuth,
} from '../middleware';
import { verifyAccessToken, type JWTPayload } from '../jwt';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const mockVerify = verifyAccessToken as ReturnType<typeof vi.fn>;
const mockAuth = auth as ReturnType<typeof vi.fn>;
const mockPrisma = prisma as unknown as {
  zKUser: { findUnique: ReturnType<typeof vi.fn> };
  organizationUser: { findMany: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  const h = new Headers(headers);
  return new NextRequest('http://localhost/api/test', { headers: h });
}

// ---------------------------------------------------------------------------
// getAuthFromRequest
// ---------------------------------------------------------------------------

describe('getAuthFromRequest', () => {
  it('returns null when no Authorization header', () => {
    const req = makeRequest();
    expect(getAuthFromRequest(req)).toBeNull();
  });

  it('returns null when Authorization header is not Bearer', () => {
    const req = makeRequest({ authorization: 'Basic abc123' });
    expect(getAuthFromRequest(req)).toBeNull();
  });

  it('returns payload when valid Bearer token', () => {
    const payload: JWTPayload = { userId: 'u1', email: 'a@b.com' };
    mockVerify.mockReturnValue(payload);

    const req = makeRequest({ authorization: 'Bearer validtoken' });
    const result = getAuthFromRequest(req);
    expect(result).toEqual(payload);
    expect(mockVerify).toHaveBeenCalledWith('validtoken');
  });

  it('returns null when token is invalid', () => {
    mockVerify.mockReturnValue(null);

    const req = makeRequest({ authorization: 'Bearer badtoken' });
    expect(getAuthFromRequest(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getAuthFromRequestOrSession
// ---------------------------------------------------------------------------

describe('getAuthFromRequestOrSession', () => {
  it('uses Bearer token when present (does not fall through to session)', async () => {
    const payload: JWTPayload = { userId: 'u1', email: 'a@b.com' };
    mockVerify.mockReturnValue(payload);

    const req = makeRequest({ authorization: 'Bearer tok' });
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toEqual(payload);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('returns null when Bearer token is invalid (no session fallback)', async () => {
    mockVerify.mockReturnValue(null);

    const req = makeRequest({ authorization: 'Bearer bad' });
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toBeNull();
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('falls back to session when no Bearer header', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'web1', email: 'a@b.com' } });
    mockPrisma.zKUser.findUnique.mockResolvedValue({ id: 'zk1', email: 'a@b.com' });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { organizationId: 'org1' },
    ]);

    const req = makeRequest();
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toEqual({
      userId: 'zk1',
      email: 'a@b.com',
      orgIds: ['org1'],
    });
  });

  it('returns SessionOnlyAuth when session user has no ZKUser', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'web1', email: 'a@b.com' } });
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);

    const req = makeRequest();
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toEqual({ kind: 'session', webUserId: 'web1', email: 'a@b.com' });
  });

  it('returns null when session user has no ZKUser and no email', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'web1', email: null } });
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);

    const req = makeRequest();
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toBeNull();
  });

  it('returns null when no session', async () => {
    mockAuth.mockResolvedValue(null);

    const req = makeRequest();
    const result = await getAuthFromRequestOrSession(req);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isSessionOnlyAuth
// ---------------------------------------------------------------------------

describe('isSessionOnlyAuth', () => {
  it('returns true for SessionOnlyAuth', () => {
    const auth: SessionOnlyAuth = { kind: 'session', webUserId: 'w1', email: 'a@b.com' };
    expect(isSessionOnlyAuth(auth)).toBe(true);
  });

  it('returns false for JWTPayload', () => {
    const auth: JWTPayload = { userId: 'u1', email: 'a@b.com' };
    expect(isSessionOnlyAuth(auth)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// withAuth
// ---------------------------------------------------------------------------

describe('withAuth', () => {
  it('calls handler when auth is valid', async () => {
    const payload: JWTPayload = { userId: 'u1', email: 'a@b.com' };
    mockVerify.mockReturnValue(payload);

    const handler = vi.fn().mockResolvedValue(NextResponse.json({ ok: true }));
    const wrapped = withAuth(handler);

    const req = makeRequest({ authorization: 'Bearer tok' });
    const res = await wrapped(req);
    expect(handler).toHaveBeenCalledWith(req, payload);
    expect(res.status).toBe(200);
  });

  it('returns 401 when auth is invalid', async () => {
    mockVerify.mockReturnValue(null);

    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const req = makeRequest({ authorization: 'Bearer bad' });
    const res = await wrapped(req);
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// requireOrgMembership
// ---------------------------------------------------------------------------

describe('requireOrgMembership', () => {
  it('returns true when user belongs to org', () => {
    const auth: JWTPayload = { userId: 'u1', email: 'a@b.com', orgIds: ['org1', 'org2'] };
    expect(requireOrgMembership(auth, 'org1')).toBe(true);
  });

  it('returns false when user does not belong to org', () => {
    const auth: JWTPayload = { userId: 'u1', email: 'a@b.com', orgIds: ['org1'] };
    expect(requireOrgMembership(auth, 'org999')).toBe(false);
  });

  it('returns false when orgIds is undefined', () => {
    const auth: JWTPayload = { userId: 'u1', email: 'a@b.com' };
    expect(requireOrgMembership(auth, 'org1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateRequiredFields
// ---------------------------------------------------------------------------

describe('validateRequiredFields', () => {
  it('returns empty array when all fields present', () => {
    const body = { name: 'Alice', email: 'a@b.com' };
    expect(validateRequiredFields(body, ['name', 'email'])).toEqual([]);
  });

  it('returns missing field names', () => {
    const body = { name: 'Alice' };
    expect(validateRequiredFields(body, ['name', 'email'])).toEqual(['email']);
  });

  it('treats null as missing', () => {
    const body = { name: null };
    expect(validateRequiredFields(body as Record<string, unknown>, ['name'])).toEqual(['name']);
  });

  it('treats empty string as missing', () => {
    const body = { name: '' };
    expect(validateRequiredFields(body, ['name'])).toEqual(['name']);
  });

  it('treats undefined as missing', () => {
    const body = {};
    expect(validateRequiredFields(body, ['name'])).toEqual(['name']);
  });

  it('returns empty array for no required fields', () => {
    expect(validateRequiredFields({ a: 1 }, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// errorResponse / successResponse
// ---------------------------------------------------------------------------

describe('errorResponse', () => {
  it('returns Bad Request for 4xx', async () => {
    const res = errorResponse('bad input', 400);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Bad Request');
    expect(body.message).toBe('bad input');
  });

  it('returns Internal Server Error for 5xx', async () => {
    const res = errorResponse('boom', 500);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Internal Server Error');
  });

  it('defaults to 400', async () => {
    const res = errorResponse('oops');
    expect(res.status).toBe(400);
  });
});

describe('successResponse', () => {
  it('returns 200 with data', async () => {
    const res = successResponse({ id: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(1);
  });

  it('allows custom status', async () => {
    const res = successResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// addCorsHeaders / handleCorsPreflightRequest
// ---------------------------------------------------------------------------

describe('addCorsHeaders', () => {
  it('sets CORS headers on response', () => {
    const res = new NextResponse(null, { status: 200 });
    const corsRes = addCorsHeaders(res);
    expect(corsRes.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(corsRes.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });
});

describe('handleCorsPreflightRequest', () => {
  it('returns 204 with CORS headers', () => {
    const res = handleCorsPreflightRequest();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
