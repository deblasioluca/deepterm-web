import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePasskeyAuthenticationOptions, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const email = typeof body?.email === 'string' ? body.email.trim() : '';

    let allowedPasskeys: StoredPasskey[] | undefined;

    if (email) {
      const admin = await prisma.adminUser.findUnique({
        where: { email },
        include: { passkeys: true },
      });

      if (!admin || admin.passkeys.length === 0) {
        return NextResponse.json({ error: 'No passkeys found for this admin' }, { status: 404 });
      }

      allowedPasskeys = admin.passkeys.map((pk) => ({
        credentialId: pk.credentialId,
        publicKey: pk.publicKey,
        counter: pk.counter,
        deviceType: pk.deviceType as StoredPasskey['deviceType'],
        backedUp: pk.backedUp,
        transports: pk.transports ? JSON.parse(pk.transports) : null,
      }));
    }

    const options = await generatePasskeyAuthenticationOptions(allowedPasskeys);

    const cookieStore = cookies();
    cookieStore.set('admin-passkey-auth-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5,
      path: '/',
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('Failed to generate admin passkey authentication options:', error);
    return NextResponse.json({ error: 'Failed to generate authentication options' }, { status: 500 });
  }
}
