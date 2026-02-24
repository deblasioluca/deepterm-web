import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyToken, generateBackupCodes, hashBackupCode } from '@/lib/2fa';

// POST - Enable 2FA after verifying the TOTP code
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

    if (user.twoFactorEnabled) {
      return NextResponse.json(
        { error: '2FA is already enabled' },
        { status: 400 }
      );
    }

    if (!user.twoFactorSecret) {
      return NextResponse.json(
        { error: 'Please start 2FA setup first' },
        { status: 400 }
      );
    }

    // Verify the TOTP code
    const isValid = verifyToken(code, user.twoFactorSecret);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid verification code' },
        { status: 400 }
      );
    }

    // Generate backup codes
    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    // Enable 2FA and store hashed backup codes
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: JSON.stringify(hashedBackupCodes),
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes, // Return plain backup codes ONCE for user to save
      message: '2FA has been enabled. Save your backup codes in a safe place!',
    });
  } catch (error) {
    console.error('Failed to enable 2FA:', error);
    return NextResponse.json(
      { error: 'Failed to enable 2FA' },
      { status: 500 }
    );
  }
}
