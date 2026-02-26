# DeepTerm — AI Token Consumption Monitor

## Implementation Target: Web App (Raspberry Pi)

All changes are in the Next.js web app on the Pi. No app-side or AI Dev Mac changes.

---

## Overview

Track every AI API call with provider, model, activity, tokens, cost, and duration. Display usage analytics in a new cockpit tab. Integrated into the `callAI()` function so every call is auto-logged with zero manual effort.

---

## Prerequisites

These must exist before implementing this feature:
- `src/lib/ai-client.ts` — unified `callAI()` function (from AI Provider Management)
- `src/lib/ai-activities.ts` — activity registry
- `AIProvider` and `AIModel` Prisma models (from AI Provider Management)

If those don't exist yet, implement them first. The token monitor hooks into `callAI()`.

---

## Database Schema

Add to `prisma/schema.prisma`:

```prisma
// ============================================
// AI Token Usage Tracking
// ============================================

/// Every AI API call is logged here.
model AIUsageLog {
  id            String   @id @default(cuid())
  provider      String   // "anthropic", "openai", "google", "mistral", "groq"
  model         String   // "claude-opus-4-6", "gpt-4o", etc.
  activity      String   // From AI_ACTIVITIES: "deliberation.architect", "agent.implementer", etc.
  category      String   // "deliberation", "review", "planning", "agent", "ci"
  
  // Token counts
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  totalTokens   Int      @default(0)
  
  // Cost (estimated, in USD cents for precision)
  costCents     Float    @default(0)
  
  // Context — what triggered this call
  deliberationId String?
  agentLoopId    String?
  storyId        String?
  epicId         String?
  
  // Timing
  durationMs     Int     @default(0)
  success        Boolean @default(true)
  errorMessage   String?
  
  createdAt      DateTime @default(now())

  @@index([provider])
  @@index([activity])
  @@index([category])
  @@index([createdAt])
  @@index([deliberationId])
  @@index([agentLoopId])
  @@index([storyId])
  @@index([epicId])
}

/// Daily/monthly aggregates for fast dashboard queries.
/// Updated incrementally after each AI call.
model AIUsageAggregate {
  id            String   @id @default(cuid())
  period        String   // "2026-02-26" (daily) or "2026-02" (monthly)
  periodType    String   // "daily" or "monthly"
  provider      String
  model         String
  activity      String
  category      String
  
  callCount     Int      @default(0)
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  totalTokens   Int      @default(0)
  costCents     Float    @default(0)
  avgDurationMs Int      @default(0)
  errorCount    Int      @default(0)

  @@unique([period, periodType, provider, model, activity])
  @@index([period])
  @@index([periodType])
  @@index([provider])
  @@index([category])
}
```

Run migration:
```bash
cd ~/deepterm && npx prisma migrate dev --name add-ai-usage-tracking
```

---

## Cost Configuration

Default cost rates per model (USD per 1K tokens). These are stored on the `AIModel` table via the `costPer1kInput` and `costPer1kOutput` fields. Seed with:

```typescript
// prisma/seed-model-costs.ts (or in migration)

const MODEL_COSTS: Record<string, { input: number; output: number }> = {
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
```

Allow overrides in the AI & LLM settings tab (per-model cost fields are editable).

---

## Integration into callAI()

Modify `src/lib/ai-client.ts` to auto-log every call.

### Add context parameter

```typescript
export interface AICallContext {
  deliberationId?: string;
  agentLoopId?: string;
  storyId?: string;
  epicId?: string;
}

export async function callAI(
  activity: AIActivity,
  systemPrompt: string,
  messages: AIMessage[],
  options?: {
    maxTokens?: number;
    temperature?: number;
    context?: AICallContext;  // NEW — pass through from caller
  }
): Promise<AIResponse> {
  const startTime = Date.now();
  const assignment = await getAssignment(activity);
  
  let response: AIResponse | undefined;
  let success = true;
  let errorMessage: string | undefined;
  
  try {
    response = await callProvider(assignment, systemPrompt, messages, options);
    return response;
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    const durationMs = Date.now() - startTime;
    
    // Log asynchronously — never block the caller
    logAIUsage({
      provider: assignment.provider.slug,
      model: assignment.model.modelId,
      activity,
      category: AI_ACTIVITIES[activity]?.category || 'unknown',
      inputTokens: response?.inputTokens || 0,
      outputTokens: response?.outputTokens || 0,
      costCents: calculateCost(assignment.model, response?.inputTokens || 0, response?.outputTokens || 0),
      durationMs,
      success,
      errorMessage,
      context: options?.context,
    }).catch(err => console.error('[AI Usage] Failed to log:', err));
  }
}
```

### Logging function

```typescript
// src/lib/ai-usage.ts

import { prisma } from '@/lib/prisma';
import { AICallContext } from './ai-client';

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
  
  // 2. Update daily aggregate (upsert)
  const today = new Date().toISOString().slice(0, 10); // "2026-02-26"
  const month = today.slice(0, 7); // "2026-02"
  
  for (const [period, periodType] of [[today, 'daily'], [month, 'monthly']] as const) {
    const key = { period, periodType, provider: entry.provider, model: entry.model, activity: entry.activity };
    
    await prisma.aIUsageAggregate.upsert({
      where: {
        period_periodType_provider_model_activity: key,
      },
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
        errorCount: entry.success ? undefined : { increment: 1 },
        // Rolling average for duration
        avgDurationMs: entry.durationMs, // Simplified — could use proper rolling avg
      },
    });
  }
}

export function calculateCost(
  model: { costPer1kInput?: number | null; costPer1kOutput?: number | null; modelId?: string },
  inputTokens: number,
  outputTokens: number
): number {
  const inputRate = model.costPer1kInput ?? FALLBACK_COSTS[model.modelId || '']?.input ?? 0;
  const outputRate = model.costPer1kOutput ?? FALLBACK_COSTS[model.modelId || '']?.output ?? 0;
  const inputCost = (inputTokens / 1000) * inputRate;
  const outputCost = (outputTokens / 1000) * outputRate;
  return Math.round((inputCost + outputCost) * 100) / 100; // Round to cents
}

const FALLBACK_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':              { input: 0.015,    output: 0.075 },
  'claude-sonnet-4-5-20250929':   { input: 0.003,    output: 0.015 },
  'claude-haiku-4-5-20251001':    { input: 0.0008,   output: 0.004 },
  'gpt-4o':                       { input: 0.005,    output: 0.015 },
  'gpt-4o-mini':                  { input: 0.00015,  output: 0.0006 },
  'gemini-2.5-pro':               { input: 0.00125,  output: 0.005 },
  'gemini-2.5-flash':             { input: 0.000075, output: 0.0003 },
  'mistral-large-latest':         { input: 0.002,    output: 0.006 },
  'llama-3.3-70b-versatile':      { input: 0.00059,  output: 0.00079 },
};
```

---

## API Routes

### GET /api/admin/cockpit/ai-usage/summary

```typescript
// src/app/api/admin/cockpit/ai-usage/summary/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'month'; // today, week, month
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  
  // Calculate date range
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
    case 'month':
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'custom':
      startDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = to ? new Date(to) : now;
      break;
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
  
  // By activity
  const byActivity = await prisma.aIUsageLog.groupBy({
    by: ['activity', 'model'],
    where,
    _sum: { totalTokens: true, costCents: true },
    _count: true,
    orderBy: { _sum: { costCents: 'desc' } },
    take: 20,
  });
  
  // Top consumers (stories/epics)
  const topStories = await prisma.aIUsageLog.groupBy({
    by: ['storyId'],
    where: { ...where, storyId: { not: null } },
    _sum: { costCents: true, totalTokens: true },
    _count: true,
    orderBy: { _sum: { costCents: 'desc' } },
    take: 10,
  });
  
  // Fetch story titles for top consumers
  const storyIds = topStories.map(s => s.storyId).filter(Boolean) as string[];
  const stories = await prisma.story.findMany({
    where: { id: { in: storyIds } },
    select: { id: true, title: true },
  });
  const storyMap = new Map(stories.map(s => [s.id, s.title]));
  
  // Error rate
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
}
```

### GET /api/admin/cockpit/ai-usage/timeline

```typescript
// src/app/api/admin/cockpit/ai-usage/timeline/route.ts

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const period = searchParams.get('period') || 'month'; // week, month
  const granularity = searchParams.get('granularity') || 'daily'; // hourly, daily
  
  const periodType = granularity === 'hourly' ? 'daily' : (period === 'month' ? 'daily' : 'daily');
  
  const now = new Date();
  const startDate = period === 'week'
    ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    : new Date(now.getFullYear(), now.getMonth(), 1);
  
  if (granularity === 'daily') {
    // Use aggregates table for fast queries
    const aggregates = await prisma.aIUsageAggregate.groupBy({
      by: ['period'],
      where: {
        periodType: 'daily',
        period: { gte: startDate.toISOString().slice(0, 10) },
      },
      _sum: { totalTokens: true, costCents: true, callCount: true },
      orderBy: { period: 'asc' },
    });
    
    return NextResponse.json({
      granularity: 'daily',
      points: aggregates.map(a => ({
        date: a.period,
        tokens: a._sum.totalTokens || 0,
        costCents: a._sum.costCents || 0,
        calls: a._sum.callCount || 0,
      })),
    });
  }
  
  // Hourly: query raw logs grouped by hour
  const logs = await prisma.$queryRaw`
    SELECT 
      strftime('%Y-%m-%dT%H:00:00', createdAt) as hour,
      SUM(totalTokens) as tokens,
      SUM(costCents) as costCents,
      COUNT(*) as calls
    FROM AIUsageLog
    WHERE createdAt >= ${startDate.toISOString()}
    GROUP BY strftime('%Y-%m-%dT%H:00:00', createdAt)
    ORDER BY hour ASC
  `;
  
  return NextResponse.json({ granularity: 'hourly', points: logs });
}
```

### GET /api/admin/cockpit/ai-usage/details

```typescript
// src/app/api/admin/cockpit/ai-usage/details/route.ts

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activity = searchParams.get('activity');
  const provider = searchParams.get('provider');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');
  
  const where: Record<string, unknown> = {};
  if (activity) where.activity = activity;
  if (provider) where.provider = provider;
  
  const [logs, total] = await Promise.all([
    prisma.aIUsageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.aIUsageLog.count({ where }),
  ]);
  
  return NextResponse.json({ logs, total, limit, offset });
}
```

### GET /api/admin/cockpit/ai-usage/by-story/[storyId]

```typescript
// src/app/api/admin/cockpit/ai-usage/by-story/[storyId]/route.ts

export async function GET(request: NextRequest, { params }: { params: { storyId: string } }) {
  const { storyId } = params;
  
  const logs = await prisma.aIUsageLog.findMany({
    where: { storyId },
    orderBy: { createdAt: 'asc' },
  });
  
  // Group by phase
  const byPhase: Record<string, { calls: number; tokens: number; costCents: number }> = {};
  for (const log of logs) {
    const phase = log.category;
    if (!byPhase[phase]) byPhase[phase] = { calls: 0, tokens: 0, costCents: 0 };
    byPhase[phase].calls++;
    byPhase[phase].tokens += log.totalTokens;
    byPhase[phase].costCents += log.costCents;
  }
  
  // Group by agent name (from activity)
  const byAgent: Record<string, { calls: number; tokens: number; costCents: number; model: string }> = {};
  for (const log of logs) {
    const key = `${log.activity}|${log.model}`;
    if (!byAgent[key]) byAgent[key] = { calls: 0, tokens: 0, costCents: 0, model: log.model };
    byAgent[key].calls++;
    byAgent[key].tokens += log.totalTokens;
    byAgent[key].costCents += log.costCents;
  }
  
  const totals = logs.reduce((acc, log) => ({
    calls: acc.calls + 1,
    inputTokens: acc.inputTokens + log.inputTokens,
    outputTokens: acc.outputTokens + log.outputTokens,
    totalTokens: acc.totalTokens + log.totalTokens,
    costCents: acc.costCents + log.costCents,
  }), { calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costCents: 0 });
  
  return NextResponse.json({
    storyId,
    totals: { ...totals, costDollars: (totals.costCents / 100).toFixed(2) },
    byPhase,
    byAgent,
    logs, // Full detail for drill-down
  });
}
```

---

## Cockpit UI — AI Usage Tab

### New file: `src/app/admin/cockpit/components/AIUsageTab.tsx`

Add tab to cockpit page.tsx:
```
[Overview] [Triage] [Planning] [Builds] [GitHub] [System] [Reviews] [📊 AI Usage]
```

UI layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 AI Token Usage                              Period: [Month ▾]│
│                                                                  │
│ ┌─ Summary Cards ─────────────────────────────────────────────┐ │
│ │  Total Cost     Total Tokens    API Calls     Avg Latency   │ │
│ │  $14.72         2.1M            347           1.2s          │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ By Provider ───────────────────────────────────────────────┐ │
│ │  Anthropic    ████████████████████████  $12.40  (84%)       │ │
│ │  OpenAI       ████                      $1.82   (12%)       │ │
│ │  Google       ██                        $0.50   (4%)        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ By Category ───────────────────────────────────────────────┐ │
│ │  🤖 Agent Loops   ██████████████████     $8.90  (60%)       │ │
│ │  🏗️ Deliberation  ████████               $3.20  (22%)       │ │
│ │  🔍 Reviews       ███                    $1.50  (10%)       │ │
│ │  📋 Planning      ██                     $0.82  (6%)        │ │
│ │  🔧 CI/PR Review  █                     $0.30  (2%)        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Daily Trend (recharts AreaChart) ──────────────────────────┐ │
│ │  [Line chart: cost per day over last 30 days]               │ │
│ │  Tooltip shows: date, cost, tokens, calls                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Top Consumers (this month) ────────────────────────────────┐ │
│ │  1. Vault Tier Alignment (Story)      $3.40  │ 12 calls     │ │
│ │  2. Architecture Review #3            $2.80  │ 9 calls      │ │
│ │  3. Keychain Implementation (Epic)    $2.10  │ 18 calls     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recent Calls ──────────────────────────────────────────────┐ │
│ │ Time     Activity              Model          Tokens  Cost  │ │
│ │ 14:22    agent.implementer     Claude Opus    4,200  $0.38  │ │
│ │ 14:21    agent.implementer     Claude Opus    3,800  $0.34  │ │
│ │ 14:18    deliberation.security GPT-4o         2,100  $0.04  │ │
│ │ [View all →]                                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

Use `recharts` (already available in the project) for the trend chart.

### Story/Epic Usage Badge

In `PlanningTab.tsx`, add cost badge to each story/epic card:

```tsx
// In story card, after priority badge:
{story.aiCostCents > 0 && (
  <span className="text-xs text-text-tertiary">
    💰 ${(story.aiCostCents / 100).toFixed(2)}
  </span>
)}
```

Fetch story costs in the planning data loader:
```typescript
// When loading stories, join with AIUsageLog aggregation
const storyCosts = await prisma.aIUsageLog.groupBy({
  by: ['storyId'],
  _sum: { costCents: true },
});
```

---

## Files to Create

| File | Lines (est.) | Purpose |
|------|-------------|---------|
| `src/lib/ai-usage.ts` | ~80 | `logAIUsage()` + `calculateCost()` + aggregate updates |
| `src/app/api/admin/cockpit/ai-usage/summary/route.ts` | ~100 | Summary endpoint |
| `src/app/api/admin/cockpit/ai-usage/timeline/route.ts` | ~60 | Timeline endpoint |
| `src/app/api/admin/cockpit/ai-usage/details/route.ts` | ~40 | Paginated detail logs |
| `src/app/api/admin/cockpit/ai-usage/by-story/[storyId]/route.ts` | ~70 | Per-story breakdown |
| `src/app/admin/cockpit/components/AIUsageTab.tsx` | ~300 | Cockpit tab component |

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add AIUsageLog + AIUsageAggregate models |
| `src/lib/ai-client.ts` | Add logging in `callAI()` finally block + context parameter |
| `src/app/admin/cockpit/page.tsx` | Add AI Usage tab |
| `src/app/admin/cockpit/types.ts` | Add AIUsageLog, AIUsageAggregate types |
| `src/app/admin/cockpit/components/PlanningTab.tsx` | Add cost badges on story cards |

---

## Testing Checklist

- [ ] Make an AI call (e.g., via ai-propose) → log appears in AIUsageLog
- [ ] AIUsageAggregate updated for today + this month
- [ ] `/api/admin/cockpit/ai-usage/summary` returns correct totals
- [ ] Summary by provider shows correct breakdown
- [ ] Summary by category groups correctly
- [ ] `/api/admin/cockpit/ai-usage/timeline?period=week` returns daily points
- [ ] `/api/admin/cockpit/ai-usage/details?activity=planning.propose` filters correctly
- [ ] `/api/admin/cockpit/ai-usage/by-story/[id]` shows per-phase breakdown
- [ ] AIUsageTab renders with summary cards, bar charts, trend line, table
- [ ] Period selector (today/week/month) updates all data
- [ ] Story cards in PlanningTab show cost badges
- [ ] Error in AI call → logged with `success: false` + `errorMessage`
- [ ] Cost calculation matches expected rates for Anthropic/OpenAI/Google

---

*End of Document — AI Token Consumption Monitor — Web App — 2026-02-26*
