import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { recordSecurityEvent } from '@/lib/intrusion';

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.ip ??
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const clientIp = getClientIp(request);
  const ua = request.headers.get('user-agent') ?? undefined;
  const path = '/api/admin/auth/login';

  try {
    const body = await request.json();
    const { email, password, twoFactorCode, backupCode } = body as {
      email?: string;
      password?: string;
      twoFactorCode?: string;
      backupCode?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find admin user
    const admin = await prisma.adminUser.findUnique({
      where: { email },
    });

    if (!admin) {
      recordSecurityEvent({ type: 'admin_login_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'unknown_email' } });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    if (!admin.isActive) {
      recordSecurityEvent({ type: 'admin_login_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'account_disabled' } });
      return NextResponse.json(
        { error: 'Account is disabled' },
        { status: 401 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, admin.passwordHash);
    if (!isValidPassword) {
      recordSecurityEvent({ type: 'admin_login_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'wrong_password' } });
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Enforce 2FA if enabled
    if (admin.twoFactorEnabled) {
      const code = typeof twoFactorCode === 'string' ? twoFactorCode.trim() : '';
      const backup = typeof backupCode === 'string' ? backupCode.trim() : '';

      if (!code && !backup) {
        return NextResponse.json(
          { error: '2FA_REQUIRED' },
          { status: 401 }
        );
      }

      if (code) {
        if (!admin.twoFactorSecret || !verifyToken(code, admin.twoFactorSecret)) {
          recordSecurityEvent({ type: 'admin_2fa_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'invalid_totp' } });
          return NextResponse.json(
            { error: 'INVALID_2FA_CODE' },
            { status: 401 }
          );
        }
      } else {
        // backup code
        if (!admin.twoFactorBackupCodes) {
          recordSecurityEvent({ type: 'admin_2fa_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'no_backup_codes' } });
          return NextResponse.json(
            { error: 'INVALID_2FA_CODE' },
            { status: 401 }
          );
        }

        let hashedCodes: string[] = [];
        try {
          hashedCodes = JSON.parse(admin.twoFactorBackupCodes) as string[];
        } catch {
          hashedCodes = [];
        }

        const remaining = verifyBackupCode(backup, hashedCodes);
        if (!remaining) {
          recordSecurityEvent({ type: 'admin_2fa_failed', ip: clientIp, path, userAgent: ua, details: { email, reason: 'invalid_backup_code' } });
          return NextResponse.json(
            { error: 'INVALID_2FA_CODE' },
            { status: 401 }
          );
        }

        // Consume the backup code
        await prisma.adminUser.update({
          where: { id: admin.id },
          data: { twoFactorBackupCodes: JSON.stringify(remaining) },
        });
      }
    }

    // Update last login
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    // Create a simple session token (in production, use JWT or a proper session library)
    const sessionToken = Buffer.from(
      JSON.stringify({
        id: admin.id,
        email: admin.email,
        role: admin.role,
        exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      })
    ).toString('base64');

    const isHttps =
      request.nextUrl.protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https';

    // Set the session cookie
    const response = NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
      },
    });

    response.cookies.set('admin-session', sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Admin login failed:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
