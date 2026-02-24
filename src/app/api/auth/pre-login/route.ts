import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// POST - Check if user needs 2FA for login
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        passwordHash: true,
        twoFactorEnabled: true,
      },
    });

    if (!user) {
      // Don't reveal if user exists or not
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Password is valid - check if 2FA is required
    return NextResponse.json({
      requires2FA: user.twoFactorEnabled,
      userId: user.twoFactorEnabled ? user.id : undefined,
    });
  } catch (error) {
    console.error('Pre-login check error:', error);
    return NextResponse.json(
      { error: 'An error occurred' },
      { status: 500 }
    );
  }
}
