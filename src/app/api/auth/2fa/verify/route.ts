import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { cookies } from 'next/headers';

// POST - Verify 2FA code during login
export async function POST(request: NextRequest) {
  try {
    const { userId, code, isBackupCode } = await request.json();

    if (!userId || !code) {
      return NextResponse.json(
        { error: 'User ID and code are required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        twoFactorEnabled: true,
        twoFactorSecret: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is not enabled for this user' },
        { status: 400 }
      );
    }

    let isValid = false;

    if (isBackupCode) {
      // Verify backup code
      if (!user.twoFactorBackupCodes) {
        return NextResponse.json(
          { error: 'No backup codes available' },
          { status: 400 }
        );
      }

      const hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
      const remainingCodes = verifyBackupCode(code, hashedCodes);

      if (remainingCodes) {
        isValid = true;
        // Update remaining backup codes
        await prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorBackupCodes: JSON.stringify(remainingCodes),
          },
        });
      }
    } else {
      // Verify TOTP code
      isValid = verifyToken(code, user.twoFactorSecret!);
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Set a cookie to indicate 2FA was verified
    const cookieStore = await cookies();
    cookieStore.set('2fa-verified', userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    });

    return NextResponse.json({
      success: true,
      message: '2FA verification successful',
    });
  } catch (error) {
    console.error('Failed to verify 2FA:', error);
    return NextResponse.json(
      { error: 'Failed to verify 2FA' },
      { status: 500 }
    );
  }
}
