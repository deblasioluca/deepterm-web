import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { verifyPasskeyRegistration, uint8ArrayToBase64URL } from '@/lib/webauthn';
import { cookies } from 'next/headers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

// POST - Verify and store a new passkey
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    // Accept both 'registrationResponse' (from client) and 'response' (legacy)
    const { registrationResponse, response, name = 'Passkey' } = body as {
      registrationResponse?: RegistrationResponseJSON;
      response?: RegistrationResponseJSON;
      name?: string;
    };

    const regResponse = registrationResponse || response;
    
    if (!regResponse) {
      return NextResponse.json(
        { error: 'Registration response is required' },
        { status: 400 }
      );
    }

    // Get the challenge from the cookie
    const cookieStore = await cookies();
    const challenge = cookieStore.get('passkey-challenge')?.value;

    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge expired or not found' },
        { status: 400 }
      );
    }

    // Verify the registration
    const verification = await verifyPasskeyRegistration(regResponse, challenge);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Verification failed' },
        { status: 400 }
      );
    }

    const { credential, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    // Use the ID from the original response, which matches what the browser will send during login
    // This ensures consistency between registration and authentication
    const credentialIdToStore = regResponse.id;

    // Store the passkey in the database
    await prisma.passkey.create({
      data: {
        userId: session.user.id,
        credentialId: credentialIdToStore,
        publicKey: uint8ArrayToBase64URL(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: regResponse.response.transports
          ? JSON.stringify(regResponse.response.transports)
          : null,
        name,
      },
    });

    // Clear the challenge cookie
    cookieStore.delete('passkey-challenge');

    return NextResponse.json({
      success: true,
      message: 'Passkey registered successfully',
    });
  } catch (error) {
    console.error('Failed to verify passkey registration:', error);
    return NextResponse.json(
      { error: 'Failed to register passkey' },
      { status: 500 }
    );
  }
}
