import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  revokeAllTokens,
  createTokenPair,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

const BCRYPT_ROUNDS = 12;

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/password/change
 * Change master password (re-encrypts all keys)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      currentMasterPasswordHash,
      newMasterPasswordHash,
      newProtectedSymmetricKey,
      newEncryptedPrivateKey,
      kdfIterations,
      kdfType,
      kdfMemory,
      kdfParallelism,
    } = body;

    // Validate required fields
    const requiredFields = [
      'currentMasterPasswordHash',
      'newMasterPasswordHash',
      'newProtectedSymmetricKey',
      'newEncryptedPrivateKey',
    ];
    for (const field of requiredFields) {
      if (!body[field]) {
        return errorResponse(`Missing required field: ${field}`);
      }
    }

    // Find user and verify current password
    const user = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const isValidPassword = await bcrypt.compare(
      currentMasterPasswordHash,
      user.masterPasswordHash
    );

    if (!isValidPassword) {
      await createAuditLog({
        userId: auth.userId,
        eventType: 'password_changed',
        targetType: 'user',
        targetId: auth.userId,
        ipAddress: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { success: false, reason: 'invalid_current_password' },
      });
      return errorResponse('Current password is incorrect', 401);
    }

    // Hash the new password
    const newServerPasswordHash = await bcrypt.hash(newMasterPasswordHash, BCRYPT_ROUNDS);

    // Update user with new credentials
    await prisma.zKUser.update({
      where: { id: auth.userId },
      data: {
        masterPasswordHash: newServerPasswordHash,
        protectedSymmetricKey: newProtectedSymmetricKey,
        encryptedPrivateKey: newEncryptedPrivateKey,
        kdfIterations: kdfIterations || user.kdfIterations,
        kdfType: kdfType !== undefined ? kdfType : user.kdfType,
        kdfMemory: kdfMemory !== undefined ? kdfMemory : user.kdfMemory,
        kdfParallelism: kdfParallelism !== undefined ? kdfParallelism : user.kdfParallelism,
      },
    });

    // Revoke all existing tokens
    await revokeAllTokens(auth.userId);

    // Generate new tokens
    const tokens = await createTokenPair(auth.userId, user.email, auth.deviceId);

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      eventType: 'password_changed',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { success: true },
    });

    const response = successResponse({
      message: 'Password changed successfully',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Password change error:', error);
    return errorResponse('Password change failed', 500);
  }
}
