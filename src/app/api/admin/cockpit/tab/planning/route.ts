import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [epics, unassignedStories] = await Promise.all([
      prisma.epic.findMany({ orderBy: { sortOrder: "asc" }, include: { stories: { orderBy: { sortOrder: "asc" } } } }),
      prisma.story.findMany({ where: { epicId: null }, orderBy: { sortOrder: "asc" } }),
    ]);

    const allIds = [...epics.map(e => e.id), ...epics.flatMap(e => e.stories.map(s => s.id)), ...unassignedStories.map(s => s.id)];

    const [deliberations, reports, storyCosts, epicCosts] = await Promise.all([
      prisma.deliberation.findMany({ where: { OR: [{ storyId: { in: allIds } }, { epicId: { in: allIds } }] }, select: { storyId: true, epicId: true, id: true, status: true } }).catch(() => [] as any[]),
      prisma.implementationReport.findMany({ where: { OR: [{ storyId: { in: allIds } }, { epicId: { in: allIds } }] }, select: { storyId: true, epicId: true } }).catch(() => [] as any[]),
      prisma.aIUsageLog.groupBy({ by: ["storyId"], where: { storyId: { in: allIds } }, _sum: { costCents: true } }).catch(() => [] as any[]),
      prisma.aIUsageLog.groupBy({ by: ["epicId"], where: { epicId: { in: allIds } }, _sum: { costCents: true } }).catch(() => [] as any[]),
    ]);

    const delibMap = new Map<string, { count: number; activeId: string | null }>();
    for (const d of deliberations) {
      const targetId = d.storyId || d.epicId;
      if (!targetId) continue;
      const entry = delibMap.get(targetId) || { count: 0, activeId: null };
      entry.count++;
      if (!["decided", "failed"].includes(d.status)) entry.activeId = d.id;
      delibMap.set(targetId, entry);
    }
    const reportIds = new Set([...reports.filter((r: any) => r.storyId).map((r: any) => r.storyId!), ...reports.filter((r: any) => r.epicId).map((r: any) => r.epicId!)]);
    const costMap = new Map<string, number>();
    for (const sc of storyCosts) { if (sc.storyId) costMap.set(sc.storyId, sc._sum.costCents || 0); }
    for (const ec of epicCosts) { if (ec.epicId) costMap.set(ec.epicId, ec._sum.costCents || 0); }

    const enrich = (item: any) => ({
      deliberationCount: delibMap.get(item.id)?.count || 0,
      activeDeliberationId: delibMap.get(item.id)?.activeId || null,
      hasReport: reportIds.has(item.id),
      aiCostCents: costMap.get(item.id) || 0,
      lifecycleStep: item.lifecycleStep || null,
      lifecycleTemplate: item.lifecycleTemplate || 'full',
      scope: item.scope || 'app',
      loopCount: item.loopCount || 0,
    });

    return NextResponse.json({
      epics: epics.map(e => ({ ...e, ...enrich(e), stories: e.stories.map(s => ({ ...s, ...enrich(s) })) })),
      unassignedStories: unassignedStories.map(s => ({ ...s, ...enrich(s) })),
    });
  } catch { return NextResponse.json({ epics: [], unassignedStories: [] }); }
}
