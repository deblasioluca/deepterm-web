import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPasskeyAuthentication, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildAdminSessionToken(admin: { id: string; email: string; role: string }): string {
  return Buffer.from(
    JSON.stringify({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      exp: Date.now() + 24 * 60 * 60 * 1000,
    })
  ).toString('base64');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { authResponse, response } = body as {
      authResponse?: AuthenticationResponseJSON;
      response?: AuthenticationResponseJSON;
    };

    const authData = authResponse || response;
    if (!authData) {
      return NextResponse.json({ error: 'Authentication response is required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const challenge = cookieStore.get('admin-passkey-auth-challenge')?.value;
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge expired or not found' }, { status: 400 });
    }

    const passkey = await prisma.adminPasskey.findUnique({
      where: { credentialId: authData.id },
      include: { admin: true },
    });

    if (!passkey || !passkey.admin.isActive) {
      return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });
    }

    const storedPasskey: StoredPasskey = {
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: passkey.counter,
      deviceType: passkey.deviceType as StoredPasskey['deviceType'],
      backedUp: passkey.backedUp,
      transports: passkey.transports ? JSON.parse(passkey.transports) : null,
    };

    const verification = await verifyPasskeyAuthentication(authData, challenge, storedPasskey);
    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    await prisma.adminPasskey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    await prisma.adminUser.update({
      where: { id: passkey.admin.id },
      data: { lastLoginAt: new Date() },
    });

    cookieStore.delete('admin-passkey-auth-challenge');

    const sessionToken = buildAdminSessionToken({
      id: passkey.admin.id,
      email: passkey.admin.email,
      role: passkey.admin.role,
    });

    const isHttps =
      request.nextUrl.protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https';

    const res = NextResponse.json({
      success: true,
      admin: {
        id: passkey.admin.id,
        email: passkey.admin.email,
        name: passkey.admin.name,
        role: passkey.admin.role,
      },
    });

    res.cookies.set('admin-session', sessionToken, {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60,
      path: '/',
    });

    return res;
  } catch (error) {
    console.error('Failed to verify admin passkey authentication:', error);
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
  }
}
