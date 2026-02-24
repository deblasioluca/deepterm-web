import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  revokeAllTokens,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/logout
 * Logout and revoke all tokens
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    // Revoke all refresh tokens for this user
    await revokeAllTokens(auth.userId);

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      eventType: 'logout',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Logged out successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Logout error:', error);
    return errorResponse('Logout failed', 500);
  }
}
