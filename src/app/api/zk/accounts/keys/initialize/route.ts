import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
} from '@/lib/zk';

const BCRYPT_ROUNDS = 12;

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/keys/initialize
 * Initialize encryption keys for a user who was created via password login
 * This should only be called when hasKeys: false was returned from login
 * 
 * Body:
 * - protectedSymmetricKey: string (encrypted symmetric key blob)
 * - publicKey: string (RSA public key, plaintext)
 * - encryptedPrivateKey: string (RSA private key, encrypted with symmetric key)
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
      publicKey,
      encryptedPrivateKey,
      masterPasswordHash,
      kdfType,
      kdfIterations,
      kdfMemory,
      kdfParallelism,
    } = body;

    // Validate required fields
    if (!protectedSymmetricKey || !publicKey || !encryptedPrivateKey) {
      return errorResponse('Missing required fields: protectedSymmetricKey, publicKey, encryptedPrivateKey');
    }

    // Get the user
    const user = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Check if keys are already initialized
    if (user.publicKey && user.encryptedPrivateKey && user.protectedSymmetricKey) {
      return errorResponse('Keys already initialized. Use password change to rotate keys.', 400);
    }

    const data: Record<string, unknown> = {
      protectedSymmetricKey,
      publicKey,
      encryptedPrivateKey,
    };

    // If provided, store the bcrypt hash of the client-derived masterPasswordHash.
    // This enables hash-based login (/api/zk/accounts/login) in future sessions.
    if (typeof masterPasswordHash === 'string' && masterPasswordHash.trim()) {
      const serverPasswordHash = await bcrypt.hash(masterPasswordHash, BCRYPT_ROUNDS);
      data.masterPasswordHash = serverPasswordHash;

      if (kdfType !== undefined) data.kdfType = kdfType;
      if (kdfIterations !== undefined) data.kdfIterations = kdfIterations;
      if (kdfMemory !== undefined) data.kdfMemory = kdfMemory;
      if (kdfParallelism !== undefined) data.kdfParallelism = kdfParallelism;
    }

    // Update user with keys
    await prisma.zKUser.update({
      where: { id: auth.userId },
      data,
    });

    const clientIP = getClientIP(request);
    await createAuditLog({
      userId: auth.userId,
      eventType: 'keys_rotated',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { action: 'initialize' },
    });

    return successResponse({
      message: 'Encryption keys initialized successfully',
      hasKeys: true,
    });
  } catch (error) {
    console.error('Initialize keys error:', error);
    return errorResponse('Failed to initialize keys', 500);
  }
}

/**
 * GET /api/zk/accounts/keys/initialize
 * Get the user's public key and key derivation settings
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
        protectedSymmetricKey: true,
        encryptedPrivateKey: true,
        kdfType: true,
        kdfIterations: true,
        kdfMemory: true,
        kdfParallelism: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    const hasKeys = Boolean(user.publicKey && user.encryptedPrivateKey && user.protectedSymmetricKey);

    return successResponse({
      hasKeys,
      publicKey: user.publicKey || null,
      protectedSymmetricKey: user.protectedSymmetricKey || null,
      encryptedPrivateKey: user.encryptedPrivateKey || null,
      kdf: {
        type: user.kdfType,
        iterations: user.kdfIterations,
        memory: user.kdfMemory,
        parallelism: user.kdfParallelism,
      },
    });
  } catch (error) {
    console.error('Get keys error:', error);
    return errorResponse('Failed to get keys', 500);
  }
}
