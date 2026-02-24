import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generatePasskeyAuthenticationOptions, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';

// POST - Generate authentication options for passkey login
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email } = body as { email?: string };

    let allowedPasskeys: StoredPasskey[] | undefined;

    // If email is provided, only allow passkeys for that user
    if (email) {
      const user = await prisma.user.findUnique({
        where: { email },
        include: { passkeys: true },
      });

      if (!user || user.passkeys.length === 0) {
        return NextResponse.json(
          { error: 'No passkeys found for this user' },
          { status: 404 }
        );
      }

      allowedPasskeys = user.passkeys.map((pk) => ({
        credentialId: pk.credentialId,
        publicKey: pk.publicKey,
        counter: pk.counter,
        deviceType: pk.deviceType as StoredPasskey['deviceType'],
        backedUp: pk.backedUp,
        transports: pk.transports ? JSON.parse(pk.transports) : null,
      }));
    }

    // Generate authentication options (if no email, allow any passkey - discoverable credentials)
    const options = await generatePasskeyAuthenticationOptions(allowedPasskeys);

    // Store the challenge in a cookie for verification
    const cookieStore = await cookies();
    cookieStore.set('passkey-auth-challenge', options.challenge, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 5, // 5 minutes
    });

    return NextResponse.json(options);
  } catch (error) {
    console.error('Failed to generate authentication options:', error);
    return NextResponse.json(
      { error: 'Failed to generate authentication options' },
      { status: 500 }
    );
  }
}
