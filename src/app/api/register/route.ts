import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendNewUserNotification, sendWelcomeEmail } from '@/lib/email';

export async function POST(request: Request) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: 'Name, email, and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: 'member',
      },
    });

    // Link to existing ZKUser if one exists with the same email
    const existingZKUser = await prisma.zKUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (existingZKUser && !existingZKUser.webUserId) {
      await prisma.zKUser.update({
        where: { id: existingZKUser.id },
        data: { webUserId: user.id },
      });
    }

    // Send notification email to admin
    await sendNewUserNotification({
      name: user.name || '',
      email: user.email,
      id: user.id,
    });

    // Send welcome email to the new user
    await sendWelcomeEmail({
      name: user.name || '',
      email: user.email,
    });

    return NextResponse.json(
      {
        message: 'Account created successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
