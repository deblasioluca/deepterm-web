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

// GET - List all licenses (organizations with their plans)
export async function GET(request: NextRequest) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const type = searchParams.get('type') || 'all'; // all, user, team

    // Get organizations with their license info
    const orgs = await prisma.organization.findMany({
      where: search ? {
        OR: [
          { name: { contains: search } },
          { members: { some: { user: { email: { contains: search } } } } },
        ],
      } : undefined,
      include: {
        members: {
          where: { status: 'confirmed' },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: { members: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get users without organizations (free tier)
    const allOrgUserIds = await prisma.organizationUser.findMany({
      where: { status: 'confirmed' },
      select: { userId: true },
    });
    const orgUserIdSet = new Set(allOrgUserIds.map((ou) => ou.userId));

    const allZkUsers = await prisma.zKUser.findMany({
      where: search ? {
        OR: [
          { email: { contains: search } },
        ],
      } : undefined,
      select: {
        id: true,
        email: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const usersWithoutOrg = allZkUsers.filter((u) => !orgUserIdSet.has(u.id));

    const licenses = [];

    // Add organization licenses
    if (type === 'all' || type === 'team') {
      for (const org of orgs) {
        licenses.push({
          id: org.id,
          type: 'team',
          name: org.name,
          plan: org.plan,
          status: org.subscriptionStatus || 'active',
          seats: org.seats,
          memberCount: org._count.members,
          members: org.members.map((m) => ({
            id: m.id,
            name: m.user?.email || 'Unknown',
            email: m.user?.email || '',
            role: m.role,
          })),
          ssoEnabled: org.ssoEnabled,
          expiresAt: org.currentPeriodEnd,
          stripeSubscriptionId: org.stripeSubscriptionId,
          createdAt: org.createdAt,
          features: PLAN_FEATURES[org.plan] || PLAN_FEATURES.starter,
        });
      }
    }

    // Add individual user licenses (free tier)
    if (type === 'all' || type === 'user') {
      for (const user of usersWithoutOrg) {
        licenses.push({
          id: user.id,
          type: 'user',
          name: user.email,
          email: user.email,
          plan: 'starter',
          status: 'active',
          seats: 1,
          memberCount: 1,
          members: [{ id: user.id, name: user.email, email: user.email, role: 'owner' }],
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

// POST - Create a new organization with license for a user
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

    // Find the ZK user
    const zkUser = await prisma.zKUser.findUnique({
      where: { id: userId },
    });

    if (!zkUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check if user already belongs to an organization
    const existingMembership = await prisma.organizationUser.findFirst({
      where: { userId: zkUser.id, status: 'confirmed' },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: 'User already belongs to an organization' },
        { status: 400 }
      );
    }

    // Create organization with license
    const org = await prisma.organization.create({
      data: {
        name: teamName,
        plan,
        seats: seats || 1,
        subscriptionStatus: 'active',
        currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
        ssoEnabled: plan === 'team' || plan === 'enterprise',
      },
    });

    // Add user to organization as owner
    await prisma.organizationUser.create({
      data: {
        organizationId: org.id,
        userId: zkUser.id,
        role: 'owner',
        status: 'confirmed',
      },
    });

    // Log audit
    await prisma.auditLog.create({
      data: {
        adminId: admin.id,
        action: 'license.created',
        entityType: 'organization',
        entityId: org.id,
        metadata: JSON.stringify({ userId, plan, seats }),
      },
    });

    return NextResponse.json({
      success: true,
      team: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        seats: org.seats,
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
