import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { generatePasskeyRegistrationOptions, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';

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
      include: { passkeys: true },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const existingPasskeys: StoredPasskey[] = admin.passkeys.map((pk) => ({
      credentialId: pk.credentialId,
      publicKey: pk.publicKey,
      counter: pk.counter,
      deviceType: pk.deviceType as StoredPasskey['deviceType'],
      backedUp: pk.backedUp,
      transports: pk.transports ? JSON.parse(pk.transports) : null,
    }));

    const options = await generatePasskeyRegistrationOptions(
      admin.id,
      admin.email,
      admin.name,
      existingPasskeys
    );

    const cookieStore = cookies();
    cookieStore.set('admin-passkey-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5,
      path: '/',
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('Failed to generate admin passkey registration options:', error);
    return NextResponse.json({ error: 'Failed to generate registration options' }, { status: 500 });
  }
}
