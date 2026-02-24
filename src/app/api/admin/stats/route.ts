import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Get date ranges
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // User counts
    const [totalUsers, usersThisMonth, usersLastMonth] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.user.count({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
    ]);

    // Team counts
    const [totalTeams, teamsThisMonth, teamsLastMonth] = await Promise.all([
      prisma.team.count(),
      prisma.team.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      prisma.team.count({
        where: {
          createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
        },
      }),
    ]);

    // Subscription counts
    const activeSubscriptions = await prisma.team.count({
      where: {
        subscriptionStatus: 'active',
        plan: { not: 'starter' },
      },
    });

    // Calculate MRR (Monthly Recurring Revenue)
    const paidTeams = await prisma.team.findMany({
      where: {
        subscriptionStatus: 'active',
        plan: { not: 'starter' },
      },
      select: { plan: true, seats: true },
    });

    const planPrices: Record<string, number> = {
      pro: 1000, // $10 in cents
      team: 2000, // $20 in cents
    };

    const mrr = paidTeams.reduce((total, team) => {
      const pricePerSeat = planPrices[team.plan] || 0;
      return total + pricePerSeat * team.seats;
    }, 0);

    // Recent users
    const recentUsers = await prisma.user.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    // Recent activity (audit logs)
    const recentActivity = await prisma.auditLog.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        action: true,
        entityType: true,
        createdAt: true,
      },
    });

    // Calculate growth percentages
    const userGrowth = usersLastMonth > 0
      ? Math.round(((usersThisMonth - usersLastMonth) / usersLastMonth) * 100)
      : usersThisMonth > 0 ? 100 : 0;

    const teamGrowth = teamsLastMonth > 0
      ? Math.round(((teamsThisMonth - teamsLastMonth) / teamsLastMonth) * 100)
      : teamsThisMonth > 0 ? 100 : 0;

    return NextResponse.json({
      totalUsers,
      userGrowth,
      totalTeams,
      teamGrowth,
      activeSubscriptions,
      subscriptionGrowth: 0, // Would need historical data
      mrr,
      mrrGrowth: 0, // Would need historical data
      recentUsers,
      recentActivity,
    });
  } catch (error) {
    console.error('Failed to fetch admin stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
