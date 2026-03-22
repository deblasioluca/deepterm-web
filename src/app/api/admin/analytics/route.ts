import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // All parallel queries
    const [
      totalUsers,
      totalTeams,
      activeSubscriptions,
      paidTeams,
      newUsersInPeriod,
      newTeamsInPeriod,
      planCounts,
      topTeams,
      invoices,
      // Vault analytics
      totalVaultUsers,
      activeVaultUsers,
      totalVaultItems,
      deletedVaultItems,
      totalVaults,
      // Issue analytics
      openIssues,
      resolvedInPeriod,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.organization.count(),
      prisma.organization.count({ where: { subscriptionStatus: 'active', plan: { not: 'starter' } } }),
      prisma.organization.findMany({ where: { subscriptionStatus: 'active', plan: { not: 'starter' } }, select: { plan: true, seats: true } }),
      prisma.user.count({ where: { createdAt: { gte: startDate } } }),
      prisma.organization.count({ where: { createdAt: { gte: startDate } } }),
      prisma.organization.groupBy({ by: ['plan'], _count: true }),
      prisma.organization.findMany({ take: 5, orderBy: { members: { _count: 'desc' } }, include: { _count: { select: { members: true } } } }),
      prisma.invoice.findMany({ where: { createdAt: { gte: startDate }, status: 'paid' }, orderBy: { createdAt: 'asc' } }),
      // Vault stats
      prisma.zKUser.count(),
      prisma.zKUser.count({ where: { updatedAt: { gte: startDate } } }),
      prisma.zKVaultItem.count({ where: { deletedAt: null } }),
      prisma.zKVaultItem.count({ where: { deletedAt: { not: null } } }),
      prisma.zKVault.count(),
      // Issue stats
      prisma.issue.count({ where: { status: { in: ['open', 'in_progress', 'waiting_on_user'] } } }),
      prisma.issue.count({ where: { status: 'resolved', updatedAt: { gte: startDate } } }),
    ]);

    // MRR
    const planPrices: Record<string, number> = { pro: 1000, team: 2000, enterprise: 5000 };
    const totalRevenue = paidTeams.reduce((sum, t) => sum + (planPrices[t.plan] || 0) * t.seats, 0);

    // User growth: batch query with groupBy, then cumulate
    const userCreatedBuckets = await prisma.user.groupBy({
      by: ['createdAt'],
      where: { createdAt: { gte: startDate } },
      _count: true,
      orderBy: { createdAt: 'asc' },
    });

    // Build daily cumulative user count
    const baseUserCount = totalUsers - newUsersInPeriod;
    const dailyNew: Record<string, number> = {};
    for (const b of userCreatedBuckets) {
      const key = b.createdAt.toISOString().slice(0, 10);
      dailyNew[key] = (dailyNew[key] || 0) + b._count;
    }

    const userGrowth: Array<{ date: string; count: number }> = [];
    let cumulative = baseUserCount;
    const step = Math.max(1, Math.ceil(days / 12));
    for (let i = 0; i < days; i += step) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const key = date.toISOString().slice(0, 10);
      // Sum all days up to this point
      for (let d = (i === 0 ? 0 : i - step + 1); d <= i; d++) {
        const dd = new Date(startDate);
        dd.setDate(dd.getDate() + d);
        const dk = dd.toISOString().slice(0, 10);
        if (dailyNew[dk]) {
          cumulative += dailyNew[dk];
          delete dailyNew[dk]; // avoid double-counting
        }
      }
      userGrowth.push({ date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), count: cumulative });
    }

    // Revenue buckets from invoices
    const revenueByDate: Record<string, number> = {};
    for (const inv of invoices) {
      const dateKey = inv.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      revenueByDate[dateKey] = (revenueByDate[dateKey] || 0) + inv.amountPaid;
    }
    const revenueGrowth = Object.entries(revenueByDate).map(([date, amount]) => ({ date, amount }));

    // Plan distribution
    const planDistribution = planCounts.map((p) => ({ plan: p.plan, count: p._count }));

    return NextResponse.json({
      overview: {
        totalUsers,
        totalTeams,
        activeSubscriptions,
        totalRevenue,
        newUsersInPeriod,
        newTeamsInPeriod,
      },
      vault: {
        totalUsers: totalVaultUsers,
        activeUsers: activeVaultUsers,
        totalItems: totalVaultItems,
        deletedItems: deletedVaultItems,
        totalVaults: totalVaults,
      },
      issues: {
        open: openIssues,
        resolvedInPeriod,
      },
      userGrowth,
      revenueGrowth,
      planDistribution,
      topTeams: topTeams.map((t) => ({ name: t.name, members: t._count.members, plan: t.plan })),
    });
  } catch (error) {
    console.error('Failed to fetch analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
