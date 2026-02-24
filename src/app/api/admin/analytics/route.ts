import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Overview stats
    const [totalUsers, totalTeams, activeSubscriptions] = await Promise.all([
      prisma.user.count(),
      prisma.team.count(),
      prisma.team.count({
        where: { subscriptionStatus: 'active', plan: { not: 'starter' } },
      }),
    ]);

    // Calculate total revenue
    const paidTeams = await prisma.team.findMany({
      where: { subscriptionStatus: 'active', plan: { not: 'starter' } },
      select: { plan: true, seats: true },
    });

    const planPrices: Record<string, number> = { pro: 1000, team: 2000, enterprise: 5000 };
    const totalRevenue = paidTeams.reduce((sum, t) => sum + (planPrices[t.plan] || 0) * t.seats, 0);

    // User growth data
    const usersByDate = await prisma.user.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: startDate } },
      _count: true,
    });

    // Generate daily data points
    const userGrowth = [];
    for (let i = 0; i < days; i += Math.ceil(days / 10)) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const count = await prisma.user.count({
        where: { createdAt: { lte: date } },
      });
      userGrowth.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        count,
      });
    }

    // Revenue growth (simplified - based on invoices)
    const invoices = await prisma.invoice.findMany({
      where: { createdAt: { gte: startDate }, status: 'paid' },
      orderBy: { createdAt: 'asc' },
    });

    const revenueByDate: Record<string, number> = {};
    invoices.forEach((inv) => {
      const dateKey = inv.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + inv.amountPaid;
    });

    const revenueGrowth = Object.entries(revenueByDate).map(([date, amount]) => ({
      date,
      amount,
    }));

    // Plan distribution
    const planCounts = await prisma.team.groupBy({
      by: ['plan'],
      _count: true,
    });

    const planDistribution = planCounts.map((p) => ({
      plan: p.plan,
      count: p._count,
    }));

    // Top teams by member count
    const topTeams = await prisma.team.findMany({
      take: 5,
      orderBy: { members: { _count: 'desc' } },
      include: { _count: { select: { members: true } } },
    });

    return NextResponse.json({
      overview: {
        totalUsers,
        totalTeams,
        activeSubscriptions,
        totalRevenue,
      },
      userGrowth,
      revenueGrowth,
      planDistribution,
      topTeams: topTeams.map((t) => ({
        name: t.name,
        members: t._count.members,
        plan: t.plan,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
