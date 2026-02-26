import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'month';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const now = new Date();
    let startDate: Date;
    let endDate = now;

    switch (period) {
      case 'today':
        startDate = new Date(now.toISOString().slice(0, 10));
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'custom':
        startDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = to ? new Date(to) : now;
        break;
      case 'month':
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const where = {
      createdAt: { gte: startDate, lte: endDate },
    };

    // Total summary
    const totals = await prisma.aIUsageLog.aggregate({
      where,
      _sum: { inputTokens: true, outputTokens: true, totalTokens: true, costCents: true },
      _count: true,
      _avg: { durationMs: true },
    });

    // By provider
    const byProvider = await prisma.aIUsageLog.groupBy({
      by: ['provider'],
      where,
      _sum: { totalTokens: true, costCents: true },
      _count: true,
    });

    // By category
    const byCategory = await prisma.aIUsageLog.groupBy({
      by: ['category'],
      where,
      _sum: { totalTokens: true, costCents: true },
      _count: true,
    });

    // By activity + model (top 20)
    const byActivity = await prisma.aIUsageLog.groupBy({
      by: ['activity', 'model'],
      where,
      _sum: { totalTokens: true, costCents: true },
      _count: true,
      orderBy: { _sum: { costCents: 'desc' } },
      take: 20,
    });

    // Top story consumers
    const topStories = await prisma.aIUsageLog.groupBy({
      by: ['storyId'],
      where: { ...where, storyId: { not: null } },
      _sum: { costCents: true, totalTokens: true },
      _count: true,
      orderBy: { _sum: { costCents: 'desc' } },
      take: 10,
    });

    const storyIds = topStories.map(s => s.storyId).filter(Boolean) as string[];
    const stories = storyIds.length > 0
      ? await prisma.story.findMany({ where: { id: { in: storyIds } }, select: { id: true, title: true } })
      : [];
    const storyMap = new Map(stories.map(s => [s.id, s.title]));

    // Error count
    const errors = await prisma.aIUsageLog.count({
      where: { ...where, success: false },
    });

    return NextResponse.json({
      period: { start: startDate.toISOString(), end: endDate.toISOString() },
      totals: {
        calls: totals._count,
        inputTokens: totals._sum.inputTokens || 0,
        outputTokens: totals._sum.outputTokens || 0,
        totalTokens: totals._sum.totalTokens || 0,
        costCents: totals._sum.costCents || 0,
        costDollars: ((totals._sum.costCents || 0) / 100).toFixed(2),
        avgDurationMs: Math.round(totals._avg.durationMs || 0),
        errorCount: errors,
        errorRate: totals._count > 0 ? ((errors / totals._count) * 100).toFixed(1) : '0',
      },
      byProvider: byProvider.map(p => ({
        provider: p.provider,
        calls: p._count,
        totalTokens: p._sum.totalTokens || 0,
        costCents: p._sum.costCents || 0,
        costDollars: ((p._sum.costCents || 0) / 100).toFixed(2),
      })),
      byCategory: byCategory.map(c => ({
        category: c.category,
        calls: c._count,
        totalTokens: c._sum.totalTokens || 0,
        costCents: c._sum.costCents || 0,
        costDollars: ((c._sum.costCents || 0) / 100).toFixed(2),
      })),
      byActivity: byActivity.map(a => ({
        activity: a.activity,
        model: a.model,
        calls: a._count,
        totalTokens: a._sum.totalTokens || 0,
        costCents: a._sum.costCents || 0,
      })),
      topConsumers: topStories.map(s => ({
        storyId: s.storyId,
        title: storyMap.get(s.storyId!) || 'Unknown',
        calls: s._count,
        totalTokens: s._sum.totalTokens || 0,
        costCents: s._sum.costCents || 0,
        costDollars: ((s._sum.costCents || 0) / 100).toFixed(2),
      })),
    });
  } catch (error) {
    console.error('AI usage summary error:', error);
    return NextResponse.json({ error: 'Failed to fetch usage summary' }, { status: 500 });
  }
}
