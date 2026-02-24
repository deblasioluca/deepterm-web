import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { getAuthFromRequest } from '@/lib/zk/middleware';

// API Key for app authentication
const APP_API_KEY = process.env.APP_API_KEY || process.env.X_API_KEY || 'deepterm-app-secret-key';

// License plan features
const PLAN_FEATURES: Record<string, {
  maxVaults: number;
  maxCredentials: number;
  maxTeamMembers: number;
  ssoEnabled: boolean;
  prioritySupport: boolean;
}> = {
  free: {
    maxVaults: 1,
    maxCredentials: 10,
    maxTeamMembers: 0,
    ssoEnabled: false,
    prioritySupport: false,
  },
  starter: {
    maxVaults: 5,
    maxCredentials: 50,
    maxTeamMembers: 3,
    ssoEnabled: false,
    prioritySupport: false,
  },
  pro: {
    maxVaults: 20,
    maxCredentials: 200,
    maxTeamMembers: 10,
    ssoEnabled: false,
    prioritySupport: true,
  },
  team: {
    maxVaults: 100,
    maxCredentials: 1000,
    maxTeamMembers: 50,
    ssoEnabled: true,
    prioritySupport: true,
  },
  enterprise: {
    maxVaults: -1,
    maxCredentials: -1,
    maxTeamMembers: -1,
    ssoEnabled: true,
    prioritySupport: true,
  },
  business: {
    maxVaults: -1,
    maxCredentials: -1,
    maxTeamMembers: -1,
    ssoEnabled: true,
    prioritySupport: true,
  },
};

// POST - Login user from the app
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

    const authHeader = request.headers.get('authorization');
    const zkAuth = getAuthFromRequest(request);
    if (authHeader && authHeader.startsWith('Bearer ') && !zkAuth) {
      return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
    }

    let user: any = null;

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      if (zkUser.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
          include: { team: true },
        });
      }

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          include: { team: true },
        });
      }

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else {
      const { email, password, twoFactorCode } = await request.json();

      if (!email || !password) {
        return NextResponse.json(
          { error: 'Email and password are required' },
          { status: 400 }
        );
      }

      // Find user by email
      user = await prisma.user.findUnique({
        where: { email },
        include: {
          team: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      // Validate password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return NextResponse.json(
          { error: 'Invalid password' },
          { status: 401 }
        );
      }

      if (user.twoFactorEnabled) {
        const code = typeof twoFactorCode === 'string' ? twoFactorCode.trim() : '';
        if (!code) {
          return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });
        }

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(code, secret) : false;
        if (!isTotpValid) {
          let hashedCodes: string[] | null = null;
          if (user.twoFactorBackupCodes) {
            try {
              hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
            } catch {
              hashedCodes = null;
            }
          }

          if (!hashedCodes || !Array.isArray(hashedCodes) || hashedCodes.length === 0) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          const remaining = verifyBackupCode(code, hashedCodes);
          if (!remaining) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: JSON.stringify(remaining) },
          });
        }
      }
    }

    // Determine license status
    const team = user.team;
    let plan = 'free';
    let subscriptionStatus = 'active';
    let expiresAt: Date | null = null;

    if (team) {
      plan = team.plan || 'starter';
      subscriptionStatus = team.subscriptionStatus || 'active';
      expiresAt = team.currentPeriodEnd;
    }

    // Check if subscription is valid
    const isSubscriptionValid = 
      subscriptionStatus === 'active' || 
      subscriptionStatus === 'trialing' ||
      (subscriptionStatus === 'past_due' && expiresAt && expiresAt > new Date());

    const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

    return NextResponse.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      },
      license: {
        valid: isSubscriptionValid,
        plan,
        status: subscriptionStatus,
        teamId: team?.id || null,
        teamName: team?.name || null,
        seats: team?.seats || 1,
        expiresAt: expiresAt?.toISOString() || null,
        features,
      },
    });
  } catch (error) {
    console.error('App login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
