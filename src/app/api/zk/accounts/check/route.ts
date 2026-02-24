import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/check
 * Check account status for a given email.
 * Returns which login method should be used.
 * 
 * This helps the app decide:
 * - If ZKUser exists with keys → use standard ZK login (masterPasswordHash)
 * - If ZKUser exists without keys → use password login, then generate keys
 * - If only web User exists → use password login (auto-creates ZKUser)
 * - If neither exists → show registration
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse('Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check ZKUser
    const zkUser = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        publicKey: true,
        encryptedPrivateKey: true,
        protectedSymmetricKey: true,
        kdfType: true,
        kdfIterations: true,
        kdfMemory: true,
        kdfParallelism: true,
      },
    });

    // Check web User
    const webUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        twoFactorEnabled: true,
      },
    });

    const hasKeys = Boolean(
      zkUser?.publicKey && zkUser?.encryptedPrivateKey && zkUser?.protectedSymmetricKey
    );

    let loginMethod: 'zk_login' | 'password_login' | 'register';
    let message: string;

    if (zkUser && hasKeys) {
      // Full ZK account with encryption keys — use standard ZK login
      loginMethod = 'zk_login';
      message = 'Account found. Use master password hash login.';
    } else if (zkUser && !hasKeys) {
      // ZK account exists but no encryption keys yet — login with password, generate keys
      loginMethod = 'password_login';
      message = 'Account found but encryption keys not set up. Use password login, then generate keys.';
    } else if (webUser) {
      // Web account only — login with password, auto-creates ZK account
      loginMethod = 'password_login';
      message = 'Web account found. Use password login to set up vault access.';
    } else {
      // No account at all
      loginMethod = 'register';
      message = 'No account found. Registration required.';
    }

    const response = successResponse({
      exists: Boolean(zkUser || webUser),
      loginMethod,
      message,
      // KDF params for ZK login (client needs these to derive master password hash)
      ...(zkUser && hasKeys && {
        kdfType: zkUser.kdfType,
        kdfIterations: zkUser.kdfIterations,
        kdfMemory: zkUser.kdfMemory,
        kdfParallelism: zkUser.kdfParallelism,
      }),
      // 2FA status
      requires2FA: webUser?.twoFactorEnabled || false,
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Account check error:', error);
    return errorResponse('Account check failed', 500);
  }
}
