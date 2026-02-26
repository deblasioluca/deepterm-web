import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { storyId: string } }) {
  try {
    const { storyId } = params;

    const logs = await prisma.aIUsageLog.findMany({
      where: { storyId },
      orderBy: { createdAt: 'asc' },
    });

    // Group by category (phase)
    const byPhase: Record<string, { calls: number; tokens: number; costCents: number }> = {};
    for (const log of logs) {
      const phase = log.category;
      if (!byPhase[phase]) byPhase[phase] = { calls: 0, tokens: 0, costCents: 0 };
      byPhase[phase].calls++;
      byPhase[phase].tokens += log.totalTokens;
      byPhase[phase].costCents += log.costCents;
    }

    // Group by activity+model (agent)
    const byAgent: Record<string, { calls: number; tokens: number; costCents: number; model: string }> = {};
    for (const log of logs) {
      const key = `${log.activity}|${log.model}`;
      if (!byAgent[key]) byAgent[key] = { calls: 0, tokens: 0, costCents: 0, model: log.model };
      byAgent[key].calls++;
      byAgent[key].tokens += log.totalTokens;
      byAgent[key].costCents += log.costCents;
    }

    const totals = logs.reduce(
      (acc, log) => ({
        calls: acc.calls + 1,
        inputTokens: acc.inputTokens + log.inputTokens,
        outputTokens: acc.outputTokens + log.outputTokens,
        totalTokens: acc.totalTokens + log.totalTokens,
        costCents: acc.costCents + log.costCents,
      }),
      { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costCents: 0 },
    );

    return NextResponse.json({
      storyId,
      totals: { ...totals, costDollars: (totals.costCents / 100).toFixed(2) },
      byPhase,
      byAgent,
      logs,
    });
  } catch (error) {
    console.error('AI usage by-story error:', error);
    return NextResponse.json({ error: 'Failed to fetch story usage' }, { status: 500 });
  }
}
