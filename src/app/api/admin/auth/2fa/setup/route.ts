import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { generateSecret, generateAuthURL, generateQRCode } from '@/lib/2fa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = await prisma.adminUser.findUnique({
      where: { id: session.id },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    if (admin.twoFactorEnabled) {
      return NextResponse.json({ error: '2FA is already enabled' }, { status: 400 });
    }

    const secret = generateSecret();
    const authUrl = generateAuthURL(admin.email, secret);
    const qrCode = await generateQRCode(authUrl);

    await prisma.adminUser.update({
      where: { id: session.id },
      data: { twoFactorSecret: secret },
    });

    return NextResponse.json({
      secret,
      qrCode,
      message: 'Scan the QR code with your authenticator app, then verify with a code',
    });
  } catch (error) {
    console.error('Failed to setup admin 2FA:', error);
    return NextResponse.json({ error: 'Failed to setup 2FA' }, { status: 500 });
  }
}
