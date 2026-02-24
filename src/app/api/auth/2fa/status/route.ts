import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - Get 2FA status for current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Count remaining backup codes
    let backupCodesRemaining = 0;
    if (user.twoFactorBackupCodes) {
      try {
        const codes = JSON.parse(user.twoFactorBackupCodes) as string[];
        backupCodesRemaining = codes.length;
      } catch {
        backupCodesRemaining = 0;
      }
    }

    return NextResponse.json({
      enabled: user.twoFactorEnabled,
      backupCodesRemaining,
    });
  } catch (error) {
    console.error('Failed to get 2FA status:', error);
    return NextResponse.json(
      { error: 'Failed to get 2FA status' },
      { status: 500 }
    );
  }
}
