import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List all organizations with nested OrgTeams and pagination
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const plan = searchParams.get('plan') || '';
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    
    if (search) {
      where.name = { contains: search };
    }

    if (plan) {
      where.plan = plan;
    }

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { members: true },
          },
          orgTeams: {
            include: {
              _count: {
                select: { members: true },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return NextResponse.json({
      teams: organizations.map((org) => ({
        id: org.id,
        name: org.name,
        plan: org.plan,
        seats: org.seats,
        memberCount: org._count.members,
        subscriptionStatus: org.subscriptionStatus,
        currentPeriodEnd: org.currentPeriodEnd,
        ssoEnabled: org.ssoEnabled,
        stripeCustomerId: org.stripeCustomerId,
        stripeSubscriptionId: org.stripeSubscriptionId,
        cancelAtPeriodEnd: org.cancelAtPeriodEnd,
        billingEmail: org.billingEmail,
        createdAt: org.createdAt,
        orgTeams: org.orgTeams.map((team) => ({
          id: team.id,
          name: team.name,
          description: team.description,
          isDefault: team.isDefault,
          allowFederation: team.allowFederation,
          memberCount: team._count.members,
          createdAt: team.createdAt,
        })),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch organizations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    );
  }
}

// POST - Create a new organization
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, plan, seats } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Organization name is required' },
        { status: 400 }
      );
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        plan: plan || 'free',
        seats: seats || 1,
      },
    });

    return NextResponse.json(organization);
  } catch (error) {
    console.error('Failed to create organization:', error);
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}
