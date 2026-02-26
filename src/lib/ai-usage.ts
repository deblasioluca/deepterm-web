/**
 * AI usage logging — tracks every callAI() invocation with tokens, cost, duration.
 * Writes to AIUsageLog (individual) and AIUsageAggregate (daily/monthly rollups).
 */

import { prisma } from '@/lib/prisma';

export interface AICallContext {
  deliberationId?: string;
  agentLoopId?: string;
  storyId?: string;
  epicId?: string;
}

interface UsageLogEntry {
  provider: string;
  model: string;
  activity: string;
  category: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  durationMs: number;
  success: boolean;
  errorMessage?: string;
  context?: AICallContext;
}

export async function logAIUsage(entry: UsageLogEntry): Promise<void> {
  const totalTokens = entry.inputTokens + entry.outputTokens;

  // 1. Write individual log
  await prisma.aIUsageLog.create({
    data: {
      provider: entry.provider,
      model: entry.model,
      activity: entry.activity,
      category: entry.category,
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens,
      costCents: entry.costCents,
      durationMs: entry.durationMs,
      success: entry.success,
      errorMessage: entry.errorMessage,
      deliberationId: entry.context?.deliberationId,
      agentLoopId: entry.context?.agentLoopId,
      storyId: entry.context?.storyId,
      epicId: entry.context?.epicId,
    },
  });

  // 2. Update daily + monthly aggregates
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  for (const [period, periodType] of [[today, 'daily'], [month, 'monthly']] as const) {
    const key = {
      period,
      periodType,
      provider: entry.provider,
      model: entry.model,
      activity: entry.activity,
    };

    await prisma.aIUsageAggregate.upsert({
      where: { period_periodType_provider_model_activity: key },
      create: {
        ...key,
        category: entry.category,
        callCount: 1,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens,
        costCents: entry.costCents,
        avgDurationMs: entry.durationMs,
        errorCount: entry.success ? 0 : 1,
      },
      update: {
        callCount: { increment: 1 },
        inputTokens: { increment: entry.inputTokens },
        outputTokens: { increment: entry.outputTokens },
        totalTokens: { increment: totalTokens },
        costCents: { increment: entry.costCents },
        ...(entry.success ? {} : { errorCount: { increment: 1 } }),
        avgDurationMs: entry.durationMs,
      },
    });
  }
}

export function calculateCost(
  model: { costPer1kInput?: number | null; costPer1kOutput?: number | null; modelId?: string },
  inputTokens: number,
  outputTokens: number,
): number {
  const inputRate = model.costPer1kInput ?? FALLBACK_COSTS[model.modelId || '']?.input ?? 0;
  const outputRate = model.costPer1kOutput ?? FALLBACK_COSTS[model.modelId || '']?.output ?? 0;
  const inputCost = (inputTokens / 1000) * inputRate;
  const outputCost = (outputTokens / 1000) * outputRate;
  // Return cost in cents (multiply by 100)
  return Math.round((inputCost + outputCost) * 100) / 100;
}

const FALLBACK_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':              { input: 0.015,    output: 0.075 },
  'claude-sonnet-4-5-20250929':   { input: 0.003,    output: 0.015 },
  'claude-haiku-4-5-20251001':    { input: 0.0008,   output: 0.004 },
  'gpt-4o':                       { input: 0.005,    output: 0.015 },
  'gpt-4o-mini':                  { input: 0.00015,  output: 0.0006 },
  'o1':                           { input: 0.015,    output: 0.060 },
  'o3-mini':                      { input: 0.0011,   output: 0.0044 },
  'gemini-2.5-pro':               { input: 0.00125,  output: 0.005 },
  'gemini-2.5-flash':             { input: 0.000075, output: 0.0003 },
  'mistral-large-latest':         { input: 0.002,    output: 0.006 },
  'llama-3.3-70b-versatile':      { input: 0.00059,  output: 0.00079 },
  'mixtral-8x7b-32768':           { input: 0.00024,  output: 0.00024 },
};
