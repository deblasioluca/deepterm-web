import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateSecret, generateAuthURL, generateQRCode } from '@/lib/2fa';

// POST - Start 2FA setup by generating a secret and QR code
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, twoFactorEnabled: true },
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

    // Generate a new secret
    const secret = generateSecret();
    const authUrl = generateAuthURL(user.email, secret);
    const qrCode = await generateQRCode(authUrl);

    // Store the secret temporarily (not enabled until verified)
    await prisma.user.update({
      where: { id: session.user.id },
      data: { twoFactorSecret: secret },
    });

    return NextResponse.json({
      secret,
      qrCode,
      message: 'Scan the QR code with your authenticator app, then verify with a code',
    });
  } catch (error) {
    console.error('Failed to setup 2FA:', error);
    return NextResponse.json(
      { error: 'Failed to setup 2FA' },
      { status: 500 }
    );
  }
}
