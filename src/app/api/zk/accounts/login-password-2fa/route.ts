import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/2fa';
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
} from '@/lib/zk';
import { ensureUserDefaults } from '@/lib/zk/ensure-user-defaults';
import crypto from 'crypto';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/login-password-2fa
 * Complete password login with 2FA verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, code, deviceName, deviceType = 'mobile' } = body;

    // Validate required fields
    if (!email || !password || !code) {
      return errorResponse('Email, password, and 2FA code are required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const clientIP = getClientIP(request);
    const rateLimitKey = getRateLimitKey(normalizedEmail, clientIP);

    // Check rate limit
    const rateLimitResult = await checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Find web user
    const webUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!webUser || !webUser.passwordHash) {
      return errorResponse('Invalid email or password', 401);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, webUser.passwordHash);
    if (!isValidPassword) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'invalid_password' },
      });
      return errorResponse('Invalid email or password', 401);
    }

    // Verify 2FA code
    if (!webUser.twoFactorSecret) {
      return errorResponse('2FA not configured for this account', 400);
    }

    const isValidTOTP = verifyToken(code, webUser.twoFactorSecret);

    // Check backup codes if TOTP fails
    let usedBackupCode = false;
    if (!isValidTOTP && webUser.twoFactorBackupCodes) {
      const backupCodes: string[] = JSON.parse(webUser.twoFactorBackupCodes);
      const codeHash = crypto.createHash('sha256').update(code).digest('hex');
      const codeIndex = backupCodes.indexOf(codeHash);
      
      if (codeIndex !== -1) {
        usedBackupCode = true;
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        await prisma.user.update({
          where: { id: webUser.id },
          data: { twoFactorBackupCodes: JSON.stringify(backupCodes) },
        });
      }
    }

    if (!isValidTOTP && !usedBackupCode) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, reason: 'invalid_2fa_code' },
      });
      return errorResponse('Invalid 2FA code', 401);
    }

    // Reset rate limit on successful verification
    await resetRateLimit(rateLimitKey);

    // Find or create ZK user
    let zkUser = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!zkUser) {
      const masterPasswordHash = await bcrypt.hash(password, 12);
      
      zkUser = await prisma.zKUser.create({
        data: {
          email: normalizedEmail,
          masterPasswordHash: masterPasswordHash,
          protectedSymmetricKey: '',
          publicKey: '',
          encryptedPrivateKey: '',
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
        metadata: { method: 'password_login_2fa', linkedWebUser: webUser.id },
      });
    } else if (!zkUser.webUserId) {
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
        method: 'password_2fa',
        usedBackupCode,
      },
    });

    // Ensure default org, team, and vault exist for this user
    const displayName = webUser.name || normalizedEmail.split('@')[0];
    const { vaultId: defaultVaultId } = await ensureUserDefaults(zkUser.id, displayName);

    const hasKeys = Boolean(zkUser.publicKey && zkUser.encryptedPrivateKey);

    return successResponse({
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
      usedBackupCode,
    });
  } catch (error) {
    console.error('Password 2FA login error:', error);
    return errorResponse('Login failed', 500);
  }
}
