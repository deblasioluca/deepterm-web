import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@/lib/prisma';
import {
  createTokenPair,
  createAuditLog,
  getClientIP,
  checkRateLimit,
  getRateLimitKey,
  rateLimitResponse,
  resetRateLimit,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/login
 * Authenticate user and return tokens
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, masterPasswordHash, deviceName, deviceType = 'desktop' } = body;

    // Validate required fields
    if (!email || !masterPasswordHash) {
      return errorResponse('Email and masterPasswordHash are required');
    }

    const normalizedEmail = email.toLowerCase();
    const clientIP = getClientIP(request);
    const rateLimitKey = getRateLimitKey(normalizedEmail, clientIP);

    // Check rate limit
    const rateLimitResult = await checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'rate_limited' },
      });
      return rateLimitResponse(rateLimitResult);
    }

    // Find user
    const user = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'user_not_found' },
      });
      return errorResponse('Invalid email or password', 401);
    }

    // Verify password (comparing client's masterPasswordHash with our double-hashed version)
    const isValidPassword = await bcrypt.compare(masterPasswordHash, user.masterPasswordHash);
    if (!isValidPassword) {
      await createAuditLog({
        userId: user.id,
        eventType: 'login_failed',
        targetType: 'user',
        targetId: user.id,
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { reason: 'invalid_password' },
      });
      return errorResponse('Invalid email or password', 401);
    }

    // Reset rate limit on successful login
    await resetRateLimit(rateLimitKey);

    // Register/update device
    let device = null;
    if (deviceName) {
      const deviceIdentifier = `${user.id}:${deviceName}:${deviceType}`;
      
      device = await prisma.device.upsert({
        where: { identifier: deviceIdentifier },
        update: { lastActive: new Date() },
        create: {
          userId: user.id,
          name: deviceName,
          deviceType,
          identifier: deviceIdentifier,
        },
      });
    }

    // Generate tokens
    const tokens = await createTokenPair(user.id, user.email, device?.id);

    // Audit log
    await createAuditLog({
      userId: user.id,
      eventType: 'login_success',
      targetType: 'user',
      targetId: user.id,
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
      deviceInfo: { deviceId: device?.id, deviceName, deviceType },
    });

    const response = successResponse({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      protectedSymmetricKey: user.protectedSymmetricKey,
      publicKey: user.publicKey,
      encryptedPrivateKey: user.encryptedPrivateKey,
      kdfType: user.kdfType,
      kdfIterations: user.kdfIterations,
      kdfMemory: user.kdfMemory,
      kdfParallelism: user.kdfParallelism,
      user: {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
      },
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Login error:', error);
    return errorResponse('Login failed', 500);
  }
}
