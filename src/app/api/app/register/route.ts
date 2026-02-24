import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { sendNewUserNotification, sendWelcomeEmail } from '@/lib/email';

// API Key for app authentication (should be set in environment)
const APP_API_KEY = process.env.APP_API_KEY || process.env.X_API_KEY || 'deepterm-app-secret-key';

// POST - Register a new user from the app
export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== APP_API_KEY) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const { name, email, password, deviceInfo } = await request.json();

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

    // Send notification email to admin (include device info if provided)
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

    // Return user info with license status (new users have no license/free tier)
    return NextResponse.json(
      {
        success: true,
        message: 'Account created successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        license: {
          valid: true,
          plan: 'free',
          status: 'active',
          features: {
            maxVaults: 1,
            maxCredentials: 10,
            teamMembers: 0,
            ssoEnabled: false,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('App registration error:', error);
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    );
  }
}
