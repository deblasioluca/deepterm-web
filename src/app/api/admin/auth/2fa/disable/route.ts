import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { verifyToken } from '@/lib/2fa';

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

    if (!admin.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA is not enabled' }, { status: 400 });
    }

    if (!admin.twoFactorSecret || !verifyToken(code, admin.twoFactorSecret)) {
      return NextResponse.json({ error: 'Invalid verification code' }, { status: 400 });
    }

    await prisma.adminUser.update({
      where: { id: session.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
      },
    });

    return NextResponse.json({ success: true, message: '2FA has been disabled' });
  } catch (error) {
    console.error('Failed to disable admin 2FA:', error);
    return NextResponse.json({ error: 'Failed to disable 2FA' }, { status: 500 });
  }
}
