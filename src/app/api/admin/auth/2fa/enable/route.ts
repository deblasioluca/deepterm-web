import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { verifyToken, generateBackupCodes, hashBackupCode } from '@/lib/2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const code = typeof body?.code === 'string' ? body.code.trim() : '';

    if (!code) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    if (admin.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 });
    }

    if (!admin.twoFactorSecret) {
      return NextResponse.json({ error: 'Please start 2FA setup first' }, { status: 400 });
    }

    if (!verifyToken(code, admin.twoFactorSecret)) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    const backupCodes = generateBackupCodes();
    const hashedBackupCodes = backupCodes.map(hashBackupCode);

    await prisma.adminUser.update({
      where: { id: session.id },
      data: {
        twoFactorEnabled: true,
        twoFactorBackupCodes: JSON.stringify(hashedBackupCodes),
      },
    });

    return NextResponse.json({
      success: true,
      backupCodes,
      message: '2FA has been enabled. Save your backup codes in a safe place!',
    });
  } catch (error) {
    console.error('Failed to enable admin 2FA:', error);
    return NextResponse.json({ error: 'Failed to enable 2FA' }, { status: 500 });
  }
}
