import { NextRequest } from 'next/server';
import { createPublicKey } from 'crypto';
import jwt from 'jsonwebtoken';
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GitHubUser {
  id: number;
  email: string | null;
  name: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

interface AppleJWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
  [key: string]: unknown; // Required for Node.js crypto.createPublicKey({ format: 'jwk' })
}

// ---------------------------------------------------------------------------
// Apple JWKS cache — 1-hour TTL to avoid hitting Apple on every request
// ---------------------------------------------------------------------------

let appleJwksCache: { keys: AppleJWK[]; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000;

async function getApplePublicKeys(): Promise<AppleJWK[]> {
  const now = Date.now();
  if (appleJwksCache && now - appleJwksCache.fetchedAt < JWKS_CACHE_TTL_MS) {
    return appleJwksCache.keys;
  }
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error('Failed to fetch Apple public keys');
  const { keys } = (await res.json()) as { keys: AppleJWK[] };
  appleJwksCache = { keys, fetchedAt: now };
  return keys;
}

// ---------------------------------------------------------------------------
// GitHub identity verification
// ---------------------------------------------------------------------------

async function verifyGitHubToken(
  params: { accessToken: string } | { code: string; redirectUri: string },
): Promise<{ providerId: string; email: string; name: string | null }> {
  let resolvedAccessToken: string;

  if ('code' in params) {
    // Server-side code exchange — keeps GITHUB_SECRET out of the native app binary
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_NATIVE_ID,
        client_secret: process.env.GITHUB_NATIVE_SECRET,
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
    });
    if (!tokenRes.ok) throw new Error('GitHub token exchange failed');
    const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
    if (tokenData.error || !tokenData.access_token) {
      throw new Error(tokenData.error ?? 'No access_token returned from GitHub');
    }
    resolvedAccessToken = tokenData.access_token;
  } else {
    resolvedAccessToken = params.accessToken;
  }

  const headers = {
    Authorization: `Bearer ${resolvedAccessToken}`,
    'User-Agent': 'DeepTerm/1.0',
    Accept: 'application/vnd.github.v3+json',
  };

  const res = await fetch('https://api.github.com/user', { headers });
  if (!res.ok) throw new Error('Invalid GitHub access token');

  const data = (await res.json()) as GitHubUser;
  let email = data.email;

  if (!email) {
    const emailRes = await fetch('https://api.github.com/user/emails', { headers });
    if (emailRes.ok) {
      const emails = (await emailRes.json()) as GitHubEmail[];
      const primary = emails.find(e => e.primary && e.verified);
      email = primary?.email ?? null;
    }
  }

  if (!email) {
    throw new Error(
      'No verified email on GitHub account. Please make your primary email public or verify an email address.',
    );
  }

  return { providerId: String(data.id), email, name: data.name };
}

// ---------------------------------------------------------------------------
// Apple identity verification
// ---------------------------------------------------------------------------

async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<{ providerId: string; email: string }> {
  // Decode header to get kid — no signature check at this step
  const [headerB64] = identityToken.split('.');
  const header = JSON.parse(
    Buffer.from(headerB64, 'base64url').toString(),
  ) as { kid: string; alg: string };

  const keys = await getApplePublicKeys();
  const matchingKey = keys.find(k => k.kid === header.kid);
  if (!matchingKey) throw new Error('No matching Apple public key for kid: ' + header.kid);

  // Convert JWK → PEM using Node.js 20 built-in crypto
  const publicKey = createPublicKey({
    key: matchingKey,
    format: 'jwk',
  });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

  const payload = jwt.verify(identityToken, pem, {
    algorithms: ['RS256'],
    audience: process.env.APPLE_APP_BUNDLE_ID,
  }) as jwt.JwtPayload & { sub: string; email: string };

  if (!payload.sub) throw new Error('Missing sub claim in Apple token');
  if (!payload.email) throw new Error('Missing email claim in Apple token');

  return { providerId: payload.sub, email: payload.email };
}

// ---------------------------------------------------------------------------
// POST /api/zk/accounts/login-oauth
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      provider,
      accessToken,
      code,
      redirectUri,
      identityToken,
      deviceName,
      deviceType = 'mobile',
    } = body as {
      provider: string;
      accessToken?: string;
      code?: string;
      redirectUri?: string;
      identityToken?: string;
      deviceName?: string;
      deviceType?: string;
    };

    if (!provider || (provider !== 'github' && provider !== 'apple')) {
      return errorResponse('provider must be "github" or "apple"');
    }
    if (provider === 'github' && !accessToken && !(code && redirectUri)) {
      return errorResponse('Either accessToken or (code + redirectUri) is required for GitHub');
    }
    if (provider === 'apple' && !identityToken) {
      return errorResponse('identityToken is required for Apple');
    }

    const clientIP = getClientIP(request);

    // -----------------------------------------------------------------------
    // Verify identity with the OAuth provider
    // -----------------------------------------------------------------------
    let email: string;
    let name: string | null;
    let providerId: string;

    try {
      if (provider === 'github') {
        ({ email, name, providerId } = await verifyGitHubToken(
          accessToken ? { accessToken } : { code: code!, redirectUri: redirectUri! },
        ));
      } else {
        ({ email, providerId } = await verifyAppleIdentityToken(identityToken!));
        name = null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OAuth verification failed';
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { provider, reason: 'oauth_verification_failed', error: message },
      });
      return errorResponse(message, 401);
    }

    const normalizedEmail = email.toLowerCase().trim();
    const rateLimitKey = getRateLimitKey(normalizedEmail, clientIP);

    // -----------------------------------------------------------------------
    // Rate limit check on the now-known email
    // -----------------------------------------------------------------------
    const rateLimitResult = await checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      await createAuditLog({
        eventType: 'login_failed',
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { email: normalizedEmail, provider, reason: 'rate_limited' },
      });
      return rateLimitResponse(rateLimitResult);
    }

    // -----------------------------------------------------------------------
    // Find or create web User
    // -----------------------------------------------------------------------
    let webUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!webUser) {
      const fallbackName = name ?? normalizedEmail.split('@')[0];
      webUser = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: fallbackName,
          passwordHash: null,
          emailVerified: new Date(),
        },
      });

      await createAuditLog({
        eventType: 'user_registered',
        targetType: 'user',
        targetId: webUser.id,
        ipAddress: clientIP,
        userAgent: request.headers.get('user-agent') || undefined,
        metadata: { method: provider, providerId },
      });
    }

    // -----------------------------------------------------------------------
    // Find or create ZKUser linked to web User — mirrors login-password logic
    // -----------------------------------------------------------------------
    let zkUser = await prisma.zKUser.findUnique({ where: { email: normalizedEmail } });

    if (!zkUser) {
      zkUser = await prisma.zKUser.create({
        data: {
          email: normalizedEmail,
          masterPasswordHash: '',  // No master password yet; keys/initialize sets this
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
        metadata: { method: `${provider}_login`, linkedWebUser: webUser.id },
      });
    } else if (!zkUser.webUserId) {
      zkUser = await prisma.zKUser.update({
        where: { id: zkUser.id },
        data: { webUserId: webUser.id },
      });
    }

    // -----------------------------------------------------------------------
    // Reset rate limit on successful verification
    // -----------------------------------------------------------------------
    await resetRateLimit(rateLimitKey);

    // -----------------------------------------------------------------------
    // Register / update device
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Issue ZK token pair
    // -----------------------------------------------------------------------
    const { accessToken: zkAccessToken, refreshToken, expiresIn } = await createTokenPair(
      zkUser.id,
      zkUser.email,
      device?.id,
    );

    // -----------------------------------------------------------------------
    // Find or create default vault
    // -----------------------------------------------------------------------
    let defaultVault = await prisma.zKVault.findFirst({
      where: { userId: zkUser.id, isDefault: true },
    });
    if (!defaultVault) {
      defaultVault = await prisma.zKVault.create({
        data: {
          userId: zkUser.id,
          name: '',
          isDefault: true,
        },
      });
    }

    const hasKeys = Boolean(zkUser.publicKey && zkUser.encryptedPrivateKey);

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
        method: provider,
        providerId,
      },
    });

    const response = successResponse({
      defaultVaultId: defaultVault.id,
      accessToken: zkAccessToken,
      refreshToken,
      expiresIn,
      user: {
        id: zkUser.id,
        email: zkUser.email,
        name: webUser.name,
        hasKeys,
      },
      ...(hasKeys && {
        protectedSymmetricKey: zkUser.protectedSymmetricKey,
        publicKey: zkUser.publicKey,
        encryptedPrivateKey: zkUser.encryptedPrivateKey,
        kdfType: zkUser.kdfType,
        kdfIterations: zkUser.kdfIterations,
        kdfMemory: zkUser.kdfMemory,
        kdfParallelism: zkUser.kdfParallelism,
      }),
      device: device ? { id: device.id, name: device.name, type: device.deviceType } : null,
      subscription: null, // Subscription info now fetched via /api/zk/accounts/license
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('OAuth login error:', error);
    return errorResponse('Login failed', 500);
  }
}
