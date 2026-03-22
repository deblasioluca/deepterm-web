import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - List all organizations with pagination
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

    const [teams, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { members: true },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return NextResponse.json({
      teams: teams.map((team) => ({
        id: team.id,
        name: team.name,
        plan: team.plan,
        seats: team.seats,
        memberCount: team._count.members,
        subscriptionStatus: team.subscriptionStatus,
        currentPeriodEnd: team.currentPeriodEnd,
        ssoEnabled: team.ssoEnabled,
        createdAt: team.createdAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch teams:', error);
    return NextResponse.json(
      { error: 'Failed to fetch teams' },
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

    const team = await prisma.organization.create({
      data: {
        name,
        plan: plan || 'starter',
        seats: seats || 1,
      },
    });

    return NextResponse.json(team);
  } catch (error) {
    console.error('Failed to create organization:', error);
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    );
  }
}
