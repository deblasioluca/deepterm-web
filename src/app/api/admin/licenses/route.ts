import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { PLAN_LIMITS, PLAN_FEATURES as PLAN_FEATURES_SOURCE, type PlanKey } from '@/lib/plan-limits';

// Admin-facing plan features — derived from the single source of truth in plan-limits.ts
// Adds maxTeamMembers which is admin-specific (not relevant to app or ZK API)
const ADMIN_TEAM_MEMBERS: Record<string, number> = {
  starter: 0,
  pro: 10,
  team: 50,
  business: -1,
  enterprise: -1,
};

const PLAN_FEATURES: Record<string, {
  maxVaults: number;
  maxCredentials: number;
  maxKeys: number;
  maxIdentities: number;
  maxTeamMembers: number;
  ssoEnabled: boolean;
  prioritySupport: boolean;
}> = Object.fromEntries(
  (Object.keys(PLAN_LIMITS) as PlanKey[]).map(key => [key, {
    maxVaults: PLAN_LIMITS[key].maxVaults,
    maxCredentials: PLAN_LIMITS[key].maxHosts, // maxCredentials = maxHosts (connections)
    maxKeys: PLAN_LIMITS[key].maxKeys,
    maxIdentities: PLAN_LIMITS[key].maxIdentities,
    maxTeamMembers: ADMIN_TEAM_MEMBERS[key] ?? 0,
    ssoEnabled: PLAN_FEATURES_SOURCE[key].sso,
    prioritySupport: PLAN_FEATURES_SOURCE[key].prioritySupport,
  }])
);

// Helper to verify admin session
async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('admin-session')?.value;
  
  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData = JSON.parse(
      Buffer.from(sessionCookie, 'base64').toString('utf-8')
    );

    // Check if session is expired
    if (sessionData.exp && sessionData.exp < Date.now()) {
      return null;
    }

    const admin = await prisma.adminUser.findFirst({
      where: { 
        id: sessionData.id,
        isActive: true 
      },
    });

    return admin;
  } catch {
    return null;
  }
}

// GET - List all licenses (users and teams with their plans)
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all'; // all, user, team

    // Get teams with their license info
    const teams = await prisma.team.findMany({
      where: search ? {
        OR: [
          { name: { contains: search } },
          { members: { some: { email: { contains: search } } } },
        ],
      } : undefined,
      include: {
        members: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get users without teams (free tier)
    const usersWithoutTeam = await prisma.user.findMany({
      where: {
        teamId: null,
        ...(search ? {
          OR: [
            { name: { contains: search } },
            { email: { contains: search } },
          ],
        } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const licenses = [];

    // Add team licenses
    if (type === 'all' || type === 'team') {
      for (const team of teams) {
        licenses.push({
          id: team.id,
          type: 'team',
          name: team.name,
          plan: team.plan,
          status: team.subscriptionStatus || 'active',
          seats: team.seats,
          memberCount: team._count.members,
          members: team.members,
          ssoEnabled: team.ssoEnabled,
          expiresAt: team.currentPeriodEnd,
          stripeSubscriptionId: team.stripeSubscriptionId,
          createdAt: team.createdAt,
          features: PLAN_FEATURES[team.plan] || PLAN_FEATURES.starter,
        });
      }
    }

    // Add individual user licenses (free tier)
    if (type === 'all' || type === 'user') {
      for (const user of usersWithoutTeam) {
        licenses.push({
          id: user.id,
          type: 'user',
          name: user.name,
          email: user.email,
          plan: 'starter',
          status: 'active',
          seats: 1,
          memberCount: 1,
          members: [{ id: user.id, name: user.name, email: user.email, role: 'owner' }],
          ssoEnabled: false,
          expiresAt: null,
          stripeSubscriptionId: null,
          createdAt: user.createdAt,
          features: PLAN_FEATURES.starter,
        });
      }
    }

    // Sort by creation date
    licenses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      licenses,
      plans: Object.keys(PLAN_FEATURES),
      planFeatures: PLAN_FEATURES,
    });
  } catch (error) {
    console.error('Failed to fetch licenses:', error);
    return NextResponse.json(
      { error: 'Failed to fetch licenses' },
      { status: 500 }
    );
  }
}

// POST - Create a new team with license for a user
export async function POST(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, teamName, plan, seats, expiresAt } = await request.json();

    if (!userId || !teamName || !plan) {
      return NextResponse.json(
        { error: 'userId, teamName, and plan are required' },
        { status: 400 }
      );
    }

    // Find the user
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    if (user.teamId) {
      return NextResponse.json(
        { error: 'User already belongs to a team' },
        { status: 400 }
      );
    }

    // Create team with license
    const team = await prisma.team.create({
      data: {
        name: teamName,
        plan,
        seats: seats || 1,
        subscriptionStatus: 'active',
        currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
        ssoEnabled: plan === 'team' || plan === 'enterprise',
      },
    });

    // Add user to team as owner
    await prisma.user.update({
      where: { id: userId },
      data: { teamId: team.id, role: 'owner' },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'license.created',
        entityType: 'team',
        entityId: team.id,
        metadata: JSON.stringify({ userId, plan, seats }),
      },
    });

    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        plan: team.plan,
        seats: team.seats,
      },
    });
  } catch (error) {
    console.error('Failed to create license:', error);
    return NextResponse.json(
      { error: 'Failed to create license' },
      { status: 500 }
    );
  }
}
