import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/2fa';

// POST - Disable 2FA (requires current TOTP code)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { error: 'Verification code is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (!user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is not enabled' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    const isValid = verifyToken(code, user.twoFactorSecret!);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Disable 2FA and clear secrets
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: '2FA has been disabled',
    });
  } catch (error) {
    console.error('Failed to disable 2FA:', error);
    return NextResponse.json(
      { error: 'Failed to disable 2FA' },
      { status: 500 }
    );
  }
}
