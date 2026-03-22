import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { getAuthFromRequest } from '@/lib/zk/middleware';
import { determineLicenseStatus } from '@/lib/app/license';

// API Key for app authentication
const APP_API_KEY = process.env.APP_API_KEY || '';

// POST - Login user from the app
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== APP_API_KEY) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const authHeader = request.headers.get('authorization');
    const zkAuth = getAuthFromRequest(request);
    if (authHeader && authHeader.startsWith('Bearer ') && !zkAuth) {
      return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
    }

    let user: any = null;

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      if (zkUser.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
        });
      }

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
        });
      }

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else {
      const { email, password, twoFactorCode } = await request.json();

      if (!email || !password) {
        return NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        );
      }

      // Find user by email
      user = await prisma.user.findUnique({
        where: { email },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      // Validate password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Invalid password' },
          { status: 401 }
        );
      }

      if (user.twoFactorEnabled) {
        const code = typeof twoFactorCode === 'string' ? twoFactorCode.trim() : '';
        if (!code) {
          return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });
        }

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(code, secret) : false;
        if (!isTotpValid) {
          let hashedCodes: string[] | null = null;
          if (user.twoFactorBackupCodes) {
            try {
              hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
            } catch {
              hashedCodes = null;
            }
          }

          if (!hashedCodes || !Array.isArray(hashedCodes) || hashedCodes.length === 0) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          const remaining = verifyBackupCode(code, hashedCodes);
          if (!remaining) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: JSON.stringify(remaining) },
          });
        }
      }
    }

    // Look up the user's organization for billing/subscription status
    const zkUserForOrg = await prisma.zKUser.findFirst({ where: { email: user.email } });
    let org = null;
    if (zkUserForOrg) {
      const membership = await prisma.organizationUser.findFirst({
        where: { userId: zkUserForOrg.id, status: 'confirmed' },
        include: { organization: true },
      });
      org = membership?.organization ?? null;
    }

    const license = determineLicenseStatus(user, org);

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      },
      license,
    });
  } catch (error) {
    console.error('App login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
