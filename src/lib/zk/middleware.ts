import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken, JWTPayload } from './jwt';
import { getClientIP } from './rate-limit';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface AuthenticatedRequest extends NextRequest {
  auth: JWTPayload;
}

/**
 * Verify JWT authentication from request headers
 */
export function getAuthFromRequest(request: NextRequest): JWTPayload | null {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  return verifyAccessToken(token);
}

/**
 * Resolve auth from either Bearer token (macOS app) or NextAuth session (web UI).
 * Falls back to session-based auth when no Bearer token is present,
 * looking up the linked ZKUser to produce a compatible JWTPayload.
 */
export async function getAuthFromRequestOrSession(request: NextRequest): Promise<JWTPayload | null> {
  // If a Bearer header is present, it MUST be valid — don't fall through to session
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return getAuthFromRequest(request);
  }

  // No Bearer header — fall back to NextAuth session (web dashboard)
  const session = await auth();
  if (!session?.user?.id) return null;

  // Look up the linked ZKUser
  const zkUser = await prisma.zKUser.findUnique({
    where: { webUserId: session.user.id },
    select: { id: true, email: true },
  });

  if (!zkUser) {
    // No ZKUser yet (user registered via web but hasn't set up vault keys).
    // Return a session-only payload so org routes can still match by invitedEmail.
    return {
      userId: session.user.id,
      email: session.user.email || '',
      orgIds: [],
    };
  }

  // Get org memberships for the payload
  const orgUsers = await prisma.organizationUser.findMany({
    where: { userId: zkUser.id, status: 'confirmed' },
    select: { organizationId: true },
  });

  return {
    userId: zkUser.id,
    email: zkUser.email,
    orgIds: orgUsers.map(ou => ou.organizationId),
  };
}

/**
 * Require authentication middleware wrapper
 */
export function withAuth(
  handler: (request: NextRequest, auth: JWTPayload) => Promise<NextResponse>
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const auth = getAuthFromRequest(request);
    
    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or expired access token' },
        { status: 401 }
      );
    }

    return handler(request, auth);
  };
}

/**
 * Require organization membership
 */
export function requireOrgMembership(
  auth: JWTPayload,
  organizationId: string
): boolean {
  return auth.orgIds?.includes(organizationId) ?? false;
}

/**
 * Extract common request metadata
 */
export function getRequestMetadata(request: NextRequest) {
  return {
    ipAddress: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

/**
 * Parse request body with error handling
 */
export async function parseRequestBody<T>(request: NextRequest): Promise<T | null> {
  try {
    return await request.json() as T;
  } catch {
    return null;
  }
}

/**
 * Validate required fields in request body
 */
export function validateRequiredFields(
  body: Record<string, unknown>,
  requiredFields: string[]
): string[] {
  const missing: string[] = [];
  
  for (const field of requiredFields) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      missing.push(field);
    }
  }
  
  return missing;
}

/**
 * Create a standard error response
 */
export function errorResponse(
  message: string,
  status: number = 400,
  details?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      error: status >= 500 ? 'Internal Server Error' : 'Bad Request',
      message,
      ...details,
    },
    { status }
  );
}

/**
 * Create a standard success response
 */
export function successResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  return NextResponse.json(data, { status });
}

/**
 * Add rate limit headers to response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: Date
): NextResponse {
  response.headers.set('X-RateLimit-Remaining', String(remaining));
  response.headers.set('X-RateLimit-Reset', resetAt.toISOString());
  return response;
}

/**
 * Allowed CORS origins for ZK vault API routes.
 * Falls back to permissive '*' only in development.
 */
const ALLOWED_ORIGINS: string[] = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

/**
 * CORS headers for API routes
 */
export function addCorsHeaders(response: NextResponse, requestOrigin?: string | null): NextResponse {
  const origin =
    ALLOWED_ORIGINS.length > 0 && requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)
      ? requestOrigin
      : ALLOWED_ORIGINS.length > 0
        ? '' // no match — don't set header
        : '*'; // no config (dev) — allow all

  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Type');
  response.headers.set('Access-Control-Max-Age', '86400');
  if (ALLOWED_ORIGINS.length > 0) {
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

/**
 * Handle OPTIONS preflight requests
 */
export function handleCorsPreflightRequest(requestOrigin?: string | null): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return addCorsHeaders(response, requestOrigin);
}
