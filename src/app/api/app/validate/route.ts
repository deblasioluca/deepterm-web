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
    maxVaults: -1, // unlimited
    maxCredentials: -1, // unlimited
    maxTeamMembers: -1, // unlimited
    ssoEnabled: true,
    prioritySupport: true,
  },
  business: {
    maxVaults: -1, // unlimited
    maxCredentials: -1, // unlimited
    maxTeamMembers: -1, // unlimited
    ssoEnabled: true,
    prioritySupport: true,
  },
};

// POST - Validate user by email and optionally authenticate
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

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : undefined;
    const twoFactorCode = typeof body.twoFactorCode === 'string' ? body.twoFactorCode.trim() : '';

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      let user = null as any;
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
        return NextResponse.json({ valid: false, error: 'User not found' }, { status: 404 });
      }

      if (email && email.toLowerCase() !== String(user.email).toLowerCase()) {
        return NextResponse.json({ error: 'TOKEN_EMAIL_MISMATCH' }, { status: 403 });
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

      const isSubscriptionValid =
        subscriptionStatus === 'active' ||
        subscriptionStatus === 'trialing' ||
        (subscriptionStatus === 'past_due' && expiresAt && expiresAt > new Date());

      const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

      return NextResponse.json({
        valid: true,
        authenticated: true,
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
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        team: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          valid: false,
          error: 'User not found',
        },
        { status: 404 }
      );
    }

    // If password provided, validate it (and enforce 2FA if enabled)
    let authenticated = false;
    if (password) {
      authenticated = await bcrypt.compare(password, user.passwordHash);
      if (!authenticated) {
        return NextResponse.json(
          {
            valid: false,
            error: 'Invalid password',
          },
          { status: 401 }
        );
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });
        }

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(twoFactorCode, secret) : false;
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

          const remaining = verifyBackupCode(twoFactorCode, hashedCodes);
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
      valid: true,
      authenticated,
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
    console.error('App validation error:', error);
    return NextResponse.json(
      { error: 'An error occurred during validation' },
      { status: 500 }
    );
  }
}

// GET - Quick license check by email (no password)
export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      let user = null as any;
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
        return NextResponse.json({ valid: false, exists: false });
      }

      if (email && email.toLowerCase() !== String(user.email).toLowerCase()) {
        return NextResponse.json({ error: 'TOKEN_EMAIL_MISMATCH' }, { status: 403 });
      }

      const team = user.team;
      let plan = 'free';
      let subscriptionStatus = 'active';
      let expiresAt: Date | null = null;

      if (team) {
        plan = team.plan || 'starter';
        subscriptionStatus = team.subscriptionStatus || 'active';
        expiresAt = team.currentPeriodEnd;
      }

      const isSubscriptionValid =
        subscriptionStatus === 'active' ||
        subscriptionStatus === 'trialing' ||
        (subscriptionStatus === 'past_due' && expiresAt && expiresAt > new Date());

      const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

      return NextResponse.json({
        valid: true,
        exists: true,
        license: {
          valid: isSubscriptionValid,
          plan,
          status: subscriptionStatus,
          expiresAt: expiresAt?.toISOString() || null,
          features,
        },
      });
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        team: true,
      },
    });

    if (!user) {
      return NextResponse.json({
        valid: false,
        exists: false,
      });
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
      valid: true,
      exists: true,
      license: {
        valid: isSubscriptionValid,
        plan,
        status: subscriptionStatus,
        expiresAt: expiresAt?.toISOString() || null,
        features,
      },
    });
  } catch (error) {
    console.error('App license check error:', error);
    return NextResponse.json(
      { error: 'An error occurred during license check' },
      { status: 500 }
    );
  }
}
