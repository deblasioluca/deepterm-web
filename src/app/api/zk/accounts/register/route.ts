import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import {
  createAuditLog,
  getClientIP,
  checkRateLimit,
  getRateLimitKey,
  rateLimitResponse,
  errorResponse,
  successResponse,
  DEFAULT_PBKDF2_ITERATIONS,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

const BCRYPT_ROUNDS = 12;

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/register
 * Register a new ZK user
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      email,
      masterPasswordHash,
      protectedSymmetricKey,
      publicKey,
      encryptedPrivateKey,
      kdfType = 0,
      kdfIterations = DEFAULT_PBKDF2_ITERATIONS,
      kdfMemory,
      kdfParallelism,
      passwordHint,
    } = body;

    // Validate required fields
    const requiredFields = ['email', 'masterPasswordHash', 'protectedSymmetricKey', 'publicKey', 'encryptedPrivateKey'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return errorResponse(`Missing required field: ${field}`);
      }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format');
    }

    // Check if user already exists
    const existingUser = await prisma.zKUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return errorResponse('Email already registered', 409);
    }

    // Double-hash the masterPasswordHash with bcrypt for additional security
    const serverPasswordHash = await bcrypt.hash(masterPasswordHash, BCRYPT_ROUNDS);

    // Check if there's an existing web User with this email (for account linking)
    const existingWebUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { team: true },
    });

    // If web user exists but has no team, create one
    let teamId = existingWebUser?.teamId;
    if (existingWebUser && !teamId) {
      const team = await prisma.team.create({
        data: {
          name: `${existingWebUser.name}'s Team`,
          members: { connect: { id: existingWebUser.id } },
        },
      });
      teamId = team.id;
    }

    // Create the ZK user with link to web user if exists
    const user = await prisma.zKUser.create({
      data: {
        email: email.toLowerCase(),
        masterPasswordHash: serverPasswordHash,
        protectedSymmetricKey,
        publicKey,
        encryptedPrivateKey,
        kdfType,
        kdfIterations,
        kdfMemory: kdfMemory || null,
        kdfParallelism: kdfParallelism || null,
        passwordHint: passwordHint || null,
        webUserId: existingWebUser?.id || null,
      },
    });

    // If no web user exists, create one for future web access
    if (!existingWebUser) {
      const webPasswordHash = await bcrypt.hash(masterPasswordHash, BCRYPT_ROUNDS);
      const newWebUser = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          name: email.split('@')[0], // Use email prefix as name
          passwordHash: webPasswordHash,
          role: 'owner',
        },
      });
      
      // Create team for the new user
      const team = await prisma.team.create({
        data: {
          name: `${newWebUser.name}'s Team`,
          members: { connect: { id: newWebUser.id } },
        },
      });

      // Update ZK user with web user link
      await prisma.zKUser.update({
        where: { id: user.id },
        data: { webUserId: newWebUser.id },
      });
    }

    // Create a default personal vault
    const defaultVault = await prisma.zKVault.create({
      data: {
        userId: user.id,
        name: '', // Empty - encrypted name will be set by app on first sync
        isDefault: true,
      },
    });

    // Audit log
    await createAuditLog({
      userId: user.id,
      eventType: 'user_registered',
      targetType: 'user',
      targetId: user.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({
      id: user.id,
      defaultVaultId: defaultVault.id,
      encryptedSymmetricKey: protectedSymmetricKey,
      encryptedRSAPrivateKey: encryptedPrivateKey,
      rsaPublicKey: publicKey,
    }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Registration error:', error);
    return errorResponse('Registration failed', 500);
  }
}
