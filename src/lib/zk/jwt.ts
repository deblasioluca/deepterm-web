import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

const JWT_SECRET = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET || 'your-jwt-secret-key';
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY_DAYS = (() => {
  const raw = process.env.REFRESH_TOKEN_EXPIRY_DAYS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 90;
})();

export interface JWTPayload {
  userId: string;
  email: string;
  deviceId?: string;
  orgIds?: string[];
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Generate a new JWT access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    algorithm: 'HS256',
  });
}

/**
 * Generate a random refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Hash a refresh token for storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verify and decode a JWT access token
 */
export function verifyAccessToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    }) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Create a new token pair (access + refresh tokens)
 */
export async function createTokenPair(
  userId: string,
  email: string,
  deviceId?: string,
  orgIds?: string[]
): Promise<TokenPair> {
  // Get organization IDs if not provided
  if (!orgIds) {
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    orgIds = orgUsers.map(ou => ou.organizationId);
  }

  const accessToken = generateAccessToken({ userId, email, deviceId, orgIds });
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  // Calculate expiry date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);

  // Store refresh token in database
  await prisma.refreshToken.create({
    data: {
      userId,
      deviceId,
      tokenHash,
      expiresAt,
    },
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60, // 15 minutes in seconds
  };
}

/**
 * Refresh tokens - validate refresh token and issue new pair
 */
export async function refreshTokenPair(refreshToken: string): Promise<TokenPair | null> {
  const tokenHash = hashRefreshToken(refreshToken);

  // Find the refresh token
  const storedToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!storedToken) {
    return null;
  }

  // Check if expired or revoked
  if (storedToken.isRevoked || storedToken.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { id: storedToken.id } });
    return null;
  }

  // Get user's org IDs
  const orgUsers = await prisma.organizationUser.findMany({
    where: { userId: storedToken.userId, status: 'confirmed' },
    select: { organizationId: true },
  });
  const orgIds = orgUsers.map(ou => ou.organizationId);

  // Rotate the refresh token (delete old, create new)
  await prisma.refreshToken.delete({ where: { id: storedToken.id } });

  // Create new token pair
  return createTokenPair(
    storedToken.userId,
    storedToken.user.email,
    storedToken.deviceId || undefined,
    orgIds
  );
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId },
    data: { isRevoked: true },
  });
}

/**
 * Revoke a specific refresh token
 */
export async function revokeToken(refreshToken: string): Promise<boolean> {
  const tokenHash = hashRefreshToken(refreshToken);
  
  try {
    await prisma.refreshToken.update({
      where: { tokenHash },
      data: { isRevoked: true },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Clean up expired tokens (run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { isRevoked: true },
      ],
    },
  });
  return result.count;
}
