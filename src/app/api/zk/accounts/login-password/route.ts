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
import { ensureUserDefaults } from '@/lib/zk/ensure-user-defaults';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/login-password
 * Login using web account credentials (email + password)
 * Auto-creates ZK account if needed, links to web User
 * 
 * This is for users who have a web account but haven't set up ZK vault yet
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, masterPasswordHash: clientMasterHash, deviceName, deviceType = 'mobile' } = body;

    // Validate required fields — accept either password (legacy) or masterPasswordHash (ZK)
    if (!email || (!password && !clientMasterHash)) {
      return errorResponse('Email and password (or masterPasswordHash) are required');
    }

    const normalizedEmail = email.toLowerCase().trim();
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

    // Find web user
    const webUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!webUser || !webUser.passwordHash) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'user_not_found' },
      });
      return errorResponse('Invalid email or password', 401);
    }

    // Verify password against web user's hash
    const isValidPassword = await bcrypt.compare(password, webUser.passwordHash);
    if (!isValidPassword) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'invalid_password' },
      });
      return addCorsHeaders(errorResponse('Invalid email or password', 401), request.headers.get('origin'));
    }

    // Check if 2FA is required
    if (webUser.twoFactorEnabled) {
      // Return a flag indicating 2FA is needed
      // The app should then prompt for 2FA code and call /api/zk/accounts/login-password-2fa
      return successResponse({
        requires2FA: true,
        email: normalizedEmail,
        message: 'Two-factor authentication required',
      });
    }

    // Reset rate limit on successful password verification
    await resetRateLimit(rateLimitKey);

    // Find or create ZK user
    let zkUser = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!zkUser) {
      // Create ZK user linked to web user.
      // If the client sent a client-derived masterPasswordHash (ZK flow),
      // store bcrypt(clientMasterHash) so future logins can use /accounts/login.
      // Otherwise fall back to bcrypt(password) (legacy — first login from older client).
      const hashToStore = clientMasterHash
        ? await bcrypt.hash(clientMasterHash, 12)
        : await bcrypt.hash(password, 12);
      
      zkUser = await prisma.zKUser.create({
        data: {
          email: normalizedEmail,
          masterPasswordHash: hashToStore,
          protectedSymmetricKey: '', // Will be set when app generates keys
          publicKey: '', // Will be set when app generates keys
          encryptedPrivateKey: '', // Will be set when app generates keys
          webUserId: webUser.id,
        },
      });

      await createAuditLog({
        userId: zkUser.id,
        eventType: 'user_registered',
        targetType: 'user',
        targetId: zkUser.id,
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { method: 'password_login', linkedWebUser: webUser.id },
      });
    } else if (!zkUser.webUserId) {
      // Link existing ZK user to web user
      zkUser = await prisma.zKUser.update({
        where: { id: zkUser.id },
        data: { webUserId: webUser.id },
      });
    }

    // Register/update device
    let device = null;
    if (deviceName) {
      const deviceIdentifier = `${zkUser.id}:${deviceName}:${deviceType}`;
      
      device = await prisma.device.upsert({
        where: { identifier: deviceIdentifier },
        update: { lastActive: new Date() },
        create: {
          userId: zkUser.id,
          name: deviceName,
          deviceType,
          identifier: deviceIdentifier,
        },
      });
    }

    // Generate tokens
    const { accessToken, refreshToken, expiresIn } = await createTokenPair(
      zkUser.id,
      zkUser.email,
      device?.id
    );

    await createAuditLog({
      userId: zkUser.id,
      eventType: 'login_success',
      targetType: 'user',
      targetId: zkUser.id,
      ipAddress: clientIP,
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        deviceId: device?.id,
        deviceName: device?.name,
        method: 'password',
      },
    });

    // Ensure default org, team, and vault exist for this user
    const displayName = webUser.name || normalizedEmail.split('@')[0];
    const { vaultId: defaultVaultId } = await ensureUserDefaults(zkUser.id, displayName);

    // Link any pending org invitations (by invitedEmail) to the newly-created ZKUser
    await prisma.organizationUser.updateMany({
      where: {
        invitedEmail: normalizedEmail,
        userId: null,
      },
      data: {
        userId: zkUser.id,
      },
    });

    const hasKeys = Boolean(zkUser.publicKey && zkUser.encryptedPrivateKey);

    const response = successResponse({
      defaultVaultId,
      accessToken,
      refreshToken,
      expiresIn,
      user: {
        id: zkUser.id,
        email: zkUser.email,
        name: webUser.name, // From linked web user
        hasKeys,
      },
      // Include encryption keys if they exist
      ...(hasKeys && {
        protectedSymmetricKey: zkUser.protectedSymmetricKey,
        publicKey: zkUser.publicKey,
        encryptedPrivateKey: zkUser.encryptedPrivateKey,
        kdfType: zkUser.kdfType,
        kdfIterations: zkUser.kdfIterations,
        kdfMemory: zkUser.kdfMemory,
        kdfParallelism: zkUser.kdfParallelism,
      }),
      device: device ? {
        id: device.id,
        name: device.name,
        type: device.deviceType,
      } : null,
      subscription: null, // Subscription info now fetched via /api/zk/accounts/license
    });
    return addCorsHeaders(response, request.headers.get('origin'));
  } catch (error) {
    console.error('Password login error:', error);
    return errorResponse('Login failed', 500);
  }
}
