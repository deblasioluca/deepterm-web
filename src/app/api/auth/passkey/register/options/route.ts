import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generatePasskeyRegistrationOptions, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';

// POST - Generate registration options for adding a new passkey
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { passkeys: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get existing passkeys
    const existingPasskeys: StoredPasskey[] = user.passkeys.map((pk) => ({
      credentialId: pk.credentialId,
      publicKey: pk.publicKey,
      counter: pk.counter,
      deviceType: pk.deviceType as StoredPasskey['deviceType'],
      backedUp: pk.backedUp,
      transports: pk.transports ? JSON.parse(pk.transports) : null,
    }));

    const options = await generatePasskeyRegistrationOptions(
      user.id,
      user.email,
      user.name,
      existingPasskeys
    );

    // Store the challenge in a cookie for verification
    const cookieStore = await cookies();
    cookieStore.set('passkey-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5, // 5 minutes
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('Failed to generate passkey registration options:', error);
    return NextResponse.json(
      { error: 'Failed to generate registration options' },
      { status: 500 }
    );
  }
}
