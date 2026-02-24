import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
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
 * GET /api/zk/accounts/keys
 * Get user's public keys and encrypted private key
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const user = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
      select: {
        publicKey: true,
        encryptedPrivateKey: true,
        protectedSymmetricKey: true,
        kdfType: true,
        kdfIterations: true,
        kdfMemory: true,
        kdfParallelism: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const response = successResponse({
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      protectedSymmetricKey: user.protectedSymmetricKey,
      kdfType: user.kdfType,
      kdfIterations: user.kdfIterations,
      kdfMemory: user.kdfMemory,
      kdfParallelism: user.kdfParallelism,
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get keys error:', error);
    return errorResponse('Failed to retrieve keys', 500);
  }
}

/**
 * POST /api/zk/accounts/keys
 * Update user's encrypted keys (after master password change)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      protectedSymmetricKey,
      encryptedPrivateKey,
      masterPasswordHash,
      kdfType,
      kdfIterations,
      kdfMemory,
      kdfParallelism,
    } = body;

    if (!protectedSymmetricKey || !encryptedPrivateKey) {
      return errorResponse('Both protectedSymmetricKey and encryptedPrivateKey are required');
    }

    const data: Record<string, unknown> = {
      protectedSymmetricKey,
      encryptedPrivateKey,
    };

    // If the client provides a masterPasswordHash, update the server-side bcrypt hash.
    // This enables hash-based login (/api/zk/accounts/login) for users created via password login.
    if (typeof masterPasswordHash === 'string' && masterPasswordHash.trim()) {
      const serverPasswordHash = await bcrypt.hash(masterPasswordHash, BCRYPT_ROUNDS);
      data.masterPasswordHash = serverPasswordHash;

      if (kdfType !== undefined) data.kdfType = kdfType;
      if (kdfIterations !== undefined) data.kdfIterations = kdfIterations;
      if (kdfMemory !== undefined) data.kdfMemory = kdfMemory;
      if (kdfParallelism !== undefined) data.kdfParallelism = kdfParallelism;
    }

    await prisma.zKUser.update({
      where: { id: auth.userId },
      data,
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      eventType: 'keys_rotated',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Keys updated successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update keys error:', error);
    return errorResponse('Failed to update keys', 500);
  }
}
