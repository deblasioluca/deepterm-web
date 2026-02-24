import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { verifyPasskeyRegistration, uint8ArrayToBase64URL } from '@/lib/webauthn';
import { cookies } from 'next/headers';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { registrationResponse, response, name = 'Passkey' } = body as {
      registrationResponse?: RegistrationResponseJSON;
      response?: RegistrationResponseJSON;
      name?: string;
    };

    const regResponse = registrationResponse || response;
    if (!regResponse) {
      return NextResponse.json({ error: 'Registration response is required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const challenge = cookieStore.get('admin-passkey-challenge')?.value;
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    const verification = await verifyPasskeyRegistration(regResponse, challenge);
    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    const credentialIdToStore = regResponse.id;

    await prisma.adminPasskey.create({
      data: {
        adminUserId: session.id,
        credentialId: credentialIdToStore,
        publicKey: uint8ArrayToBase64URL(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: regResponse.response.transports
          ? JSON.stringify(regResponse.response.transports)
          : null,
        name: typeof name === 'string' && name.trim() ? name.trim() : 'Passkey',
      },
    });

    cookieStore.delete('admin-passkey-challenge');

    return NextResponse.json({ success: true, message: 'Passkey registered successfully' });
  } catch (error) {
    console.error('Failed to verify admin passkey registration:', error);
    return NextResponse.json({ error: 'Failed to register passkey' }, { status: 500 });
  }
}
