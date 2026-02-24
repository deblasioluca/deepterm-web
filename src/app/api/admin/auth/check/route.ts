import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
    const sessionCookie = cookieStore.get('admin-session');

    if (!sessionCookie?.value) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    // Decode and verify the session
    try {
      const sessionData = JSON.parse(
        Buffer.from(sessionCookie.value, 'base64').toString('utf-8')
      );

      // Check if session is expired
      if (sessionData.exp && sessionData.exp < Date.now()) {
        return NextResponse.json({ authenticated: false, error: 'Session expired' }, { status: 401 });
      }

      return NextResponse.json({
        authenticated: true,
        admin: {
          id: sessionData.id,
          email: sessionData.email,
          role: sessionData.role,
        },
      });
    } catch {
      return NextResponse.json({ authenticated: false, error: 'Invalid session' }, { status: 401 });
    }
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
