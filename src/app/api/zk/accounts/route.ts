import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
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
 * DELETE /api/zk/accounts
 * Delete user account
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { masterPasswordHash } = body;

    if (!masterPasswordHash) {
      return errorResponse('Master password hash is required for account deletion');
    }

    // Find user and verify password
    const user = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const isValidPassword = await bcrypt.compare(masterPasswordHash, user.masterPasswordHash);
    if (!isValidPassword) {
      return errorResponse('Invalid password', 401);
    }

    // Revoke all tokens first
    await revokeAllTokens(auth.userId);

    // Delete all user data (cascades will handle related records)
    await prisma.zKUser.delete({
      where: { id: auth.userId },
    });

    // Audit log (create before deletion completes)
    await createAuditLog({
      eventType: 'user_registered', // Using a neutral event since user is deleted
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { deletedUserId: auth.userId, deletedEmail: user.email },
    });

    const response = successResponse({ message: 'Account deleted successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Account deletion error:', error);
    return errorResponse('Account deletion failed', 500);
  }
}
