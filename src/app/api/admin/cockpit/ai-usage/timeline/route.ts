import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';

    const now = new Date();
    const startDate = period === 'week'
      ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const startStr = startDate.toISOString().slice(0, 10);

    // Use aggregates table for daily granularity
    const aggregates = await prisma.aIUsageAggregate.groupBy({
      by: ['period'],
      where: {
        periodType: 'daily',
        period: { gte: startStr },
      },
      _sum: { totalTokens: true, costCents: true, callCount: true, errorCount: true },
      orderBy: { period: 'asc' },
    });

    return NextResponse.json({
      granularity: 'daily',
      points: aggregates.map(a => ({
        date: a.period,
        tokens: a._sum.totalTokens || 0,
        costCents: a._sum.costCents || 0,
        calls: a._sum.callCount || 0,
        errors: a._sum.errorCount || 0,
      })),
    });
  } catch (error) {
    console.error('AI usage timeline error:', error);
    return NextResponse.json({ error: 'Failed to fetch timeline' }, { status: 500 });
  }
}
