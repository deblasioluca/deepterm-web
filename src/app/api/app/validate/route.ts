import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { getAuthFromRequest } from '@/lib/zk/middleware';
import { determineLicenseStatus } from '@/lib/app/license';

// API Key for app authentication
const APP_API_KEY = process.env.APP_API_KEY || '';

// POST - Validate user by email and optionally authenticate
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

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : undefined;
    const twoFactorCode = typeof body.twoFactorCode === 'string' ? body.twoFactorCode.trim() : '';

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      let user = null as any;
      if (zkUser.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
          include: { team: true },
        });
      }
      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          include: { team: true },
        });
      }

      if (!user) {
        return NextResponse.json({ valid: false, error: 'User not found' }, { status: 404 });
      }

      if (email && email.toLowerCase() !== String(user.email).toLowerCase()) {
        return NextResponse.json({ error: 'TOKEN_EMAIL_MISMATCH' }, { status: 403 });
      }

      const license = determineLicenseStatus(user);

      return NextResponse.json({
        valid: true,
        authenticated: true,
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
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        team: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          valid: false,
          error: 'User not found',
        },
        { status: 404 }
      );
    }

    // If password provided, validate it (and enforce 2FA if enabled)
    let authenticated = false;
    if (password) {
      if (!user.passwordHash) {
        return NextResponse.json(
          { valid: false, error: 'This account uses social login. Please authenticate via the app.' },
          { status: 401 }
        );
      }
      authenticated = await bcrypt.compare(password, user.passwordHash);
      if (!authenticated) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Invalid password',
          },
          { status: 401 }
        );
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });
        }

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(twoFactorCode, secret) : false;
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

          const remaining = verifyBackupCode(twoFactorCode, hashedCodes);
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

    const license = determineLicenseStatus(user);

    return NextResponse.json({
      valid: true,
      authenticated,
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
    console.error('App validation error:', error);
    return NextResponse.json(
      { error: 'An error occurred during validation' },
      { status: 500 }
    );
  }
}

// GET - Quick license check by email (no password)
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      let user = null as any;
      if (zkUser.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
          include: { team: true },
        });
      }
      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          include: { team: true },
        });
      }

      if (!user) {
        return NextResponse.json({ valid: false, exists: false });
      }

      if (email && email.toLowerCase() !== String(user.email).toLowerCase()) {
        return NextResponse.json({ error: 'TOKEN_EMAIL_MISMATCH' }, { status: 403 });
      }

      const license = determineLicenseStatus(user);

      return NextResponse.json({
        valid: true,
        exists: true,
        license,
      });
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        team: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        valid: false,
        exists: false,
      });
    }

    const license = determineLicenseStatus(user);

    return NextResponse.json({
      valid: true,
      exists: true,
      license,
    });
  } catch (error) {
    console.error('App license check error:', error);
    return NextResponse.json(
      { error: 'An error occurred during license check' },
      { status: 500 }
    );
  }
}
