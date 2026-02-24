import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyPasskeyAuthentication, type StoredPasskey } from '@/lib/webauthn';
import { cookies } from 'next/headers';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { SignJWT } from 'jose';

// POST - Verify passkey and authenticate user
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    // Accept both 'authResponse' (from client) and 'response' (legacy)
    const { authResponse, response } = body as { 
      authResponse?: AuthenticationResponseJSON;
      response?: AuthenticationResponseJSON;
    };

    const authData = authResponse || response;
    
    if (!authData) {
      return NextResponse.json(
        { error: 'Authentication response is required' },
        { status: 400 }
      );
    }

    // Get the challenge from the cookie
    const cookieStore = await cookies();
    const challenge = cookieStore.get('passkey-auth-challenge')?.value;

    if (!challenge) {
      return NextResponse.json(
        { error: 'Challenge expired or not found' },
        { status: 400 }
      );
    }

    // Debug: Log the credential ID being searched
    console.log('Looking for passkey with credentialId:', authData.id);

    // Find the passkey by credential ID
    const passkey = await prisma.passkey.findUnique({
      where: { credentialId: authData.id },
      include: { user: { include: { team: true } } },
    });

    // Debug: Log if passkey was found
    console.log('Passkey found:', passkey ? 'Yes' : 'No');

    if (!passkey) {
      // Try to find all passkeys to debug
      const allPasskeys = await prisma.passkey.findMany({ select: { credentialId: true } });
      console.log('All passkey credentialIds:', allPasskeys.map(p => p.credentialId));
      
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    // Prepare the stored passkey for verification
    const storedPasskey: StoredPasskey = {
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      counter: passkey.counter,
      deviceType: passkey.deviceType as StoredPasskey['deviceType'],
      backedUp: passkey.backedUp,
      transports: passkey.transports ? JSON.parse(passkey.transports) : null,
    };

    // Verify the authentication
    const verification = await verifyPasskeyAuthentication(
      authData,
      challenge,
      storedPasskey
    );

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
      );
    }

    // Update the counter to prevent replay attacks
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    // Clear the challenge cookie
    cookieStore.delete('passkey-auth-challenge');

    // Create a session token for the user
    const secret = new TextEncoder().encode(
      process.env.NEXTAUTH_SECRET || 'development-secret'
    );

    const token = await new SignJWT({
      id: passkey.user.id,
      email: passkey.user.email,
      name: passkey.user.name,
      role: passkey.user.role,
      teamId: passkey.user.teamId,
      teamName: passkey.user.team?.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secret);

    // Set the session cookie
    const secureCookie = process.env.NODE_ENV === 'production';
    cookieStore.set('authjs.session-token', token, {
      httpOnly: true,
      secure: secureCookie,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: passkey.user.id,
        email: passkey.user.email,
        name: passkey.user.name,
      },
    });
  } catch (error) {
    console.error('Failed to verify passkey authentication:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
