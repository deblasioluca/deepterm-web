import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    const skip = (page - 1) * limit;

    const where: any = {
      plan: { not: 'starter' },
    };

    if (search) {
      where.name = { contains: search };
    }

    if (status) {
      where.subscriptionStatus = status;
    }

    const [teams, total] = await Promise.all([
      prisma.team.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { members: true } },
        },
      }),
      prisma.team.count({ where }),
    ]);

    // Calculate stats
    const allPaidTeams = await prisma.team.findMany({
      where: { plan: { not: 'starter' } },
      select: { plan: true, seats: true, subscriptionStatus: true },
    });

    const planPrices: Record<string, number> = {
      pro: 1000,
      team: 2000,
      enterprise: 5000,
    };

    const activeTeams = allPaidTeams.filter((t) => t.subscriptionStatus === 'active');
    const canceledTeams = allPaidTeams.filter((t) => t.subscriptionStatus === 'canceled');

    const totalRevenue = activeTeams.reduce((sum, team) => {
      return sum + (planPrices[team.plan] || 0) * team.seats;
    }, 0);

    const avgSeats = activeTeams.length > 0
      ? activeTeams.reduce((sum, t) => sum + t.seats, 0) / activeTeams.length
      : 0;

    const churnRate = allPaidTeams.length > 0
      ? (canceledTeams.length / allPaidTeams.length) * 100
      : 0;

    return NextResponse.json({
      subscriptions: teams.map((team) => ({
        id: team.id,
        name: team.name,
        plan: team.plan,
        seats: team.seats,
        memberCount: team._count.members,
        subscriptionStatus: team.subscriptionStatus,
        currentPeriodEnd: team.currentPeriodEnd,
        stripeCustomerId: team.stripeCustomerId,
        stripeSubscriptionId: team.stripeSubscriptionId,
        cancelAtPeriodEnd: team.cancelAtPeriodEnd,
        createdAt: team.createdAt,
      })),
      stats: {
        totalActive: activeTeams.length,
        totalRevenue,
        avgSeats,
        churnRate,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch subscriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch subscriptions' },
      { status: 500 }
    );
  }
}
