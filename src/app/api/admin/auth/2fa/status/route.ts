import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: true,
        passkeys: { select: { id: true } },
      },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    let backupCodesRemaining = 0;
    if (admin.twoFactorBackupCodes) {
      try {
        const codes = JSON.parse(admin.twoFactorBackupCodes) as string[];
        backupCodesRemaining = codes.length;
      } catch {
        backupCodesRemaining = 0;
      }
    }

    return NextResponse.json({
      enabled: admin.twoFactorEnabled,
      backupCodesRemaining,
      passkeysCount: admin.passkeys.length,
    });
  } catch (error) {
    console.error('Failed to get admin 2FA status:', error);
    return NextResponse.json({ error: 'Failed to get 2FA status' }, { status: 500 });
  }
}
