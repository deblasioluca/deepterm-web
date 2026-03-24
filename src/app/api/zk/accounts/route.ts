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
import { cascadeDeleteUser } from '@/lib/zk/cascade-delete-user';

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

    // Cascade-delete ALL related data
    const deletedEmail = user.email;
    await prisma.$transaction(async (tx) => {
      await cascadeDeleteUser(tx, {
        webUserId: user.webUserId || undefined,
        zkUserId: auth.userId,
        userEmail: deletedEmail,
      });
    });

    // Audit log after successful deletion (user row is gone, use captured data)
    await createAuditLog({
      eventType: 'account_deleted',
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { deletedUserId: auth.userId, deletedEmail },
    });

    const response = successResponse({ message: 'Account deleted successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Account deletion error:', error);
    return errorResponse('Account deletion failed', 500);
  }
}
