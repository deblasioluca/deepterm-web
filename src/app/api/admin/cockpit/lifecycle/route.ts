import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/cockpit/lifecycle?storyId=xxx or ?status=in_progress
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (storyId) where.id = storyId;
    if (status) where.status = status;
    // Default: show active stories (in_progress, planned)
    if (!storyId && !status) {
      where.status = { in: ['planned', 'in_progress', 'done'] };
    }

    const stories = await prisma.story.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        epic: { select: { id: true, title: true, status: true } },
      },
    });

    // Enrich with deliberation, agent loop, and PR data
    const enriched = await Promise.all(stories.map(async (story) => {
      // Latest deliberation
      const deliberation = await prisma.deliberation.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      }).catch(() => null);

      // Latest agent loop
      const agentLoop = await prisma.agentLoop.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, prNumber: true, prUrl: true },
      }).catch(() => null);

      return {
        id: story.id,
        title: story.title,
        status: story.status,
        epicId: story.epicId,
        epicTitle: story.epic?.title,
        epicStatus: story.epic?.status || null,
        triageApproved: story.status !== 'backlog' ? true : null,
        deliberationStatus: deliberation?.status || null,
        deliberationId: deliberation?.id || null,
        agentLoopStatus: agentLoop?.status || null,
        agentLoopId: agentLoop?.id || null,
        prNumber: agentLoop?.prNumber || null,
        prUrl: agentLoop?.prUrl || null,
        prMerged: story.status === 'done' || story.status === 'released',
        testsPass: story.status === 'done' || story.status === 'released' ? true : null,
        deployed: story.status === 'released',
        released: story.status === 'released',
        version: null,
        releaseNotesDone: story.status === 'released',
        emailSent: story.status === 'released',
        docsUpdated: story.status === 'released',
      };
    }));

    return NextResponse.json({ stories: enriched });
  } catch (error) {
    console.error('Lifecycle API error:', error);
    return NextResponse.json({ error: 'Failed to fetch lifecycle data' }, { status: 500 });
  }
}

// POST /api/admin/cockpit/lifecycle — Gate actions for lifecycle flow
export async function POST(req: NextRequest) {
  try {
    const { action, storyId, reason } = await req.json();
    if (!storyId || !action) {
      return NextResponse.json({ error: 'storyId and action required' }, { status: 400 });
    }

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};

    switch (action) {
      case 'skip-deliberation':
        // Mark as if deliberation passed — create a "skipped" deliberation record
        await prisma.deliberation.create({
          data: { type: 'implementation', status: 'decided', storyId, title: 'Skipped', summary: 'Deliberation skipped by operator.' },
        });
        updates.status = 'in_progress';
        break;

      case 'approve-decision':
        // Approve the deliberation decision — advance to implementation
        const delib = await prisma.deliberation.findFirst({ where: { storyId }, orderBy: { createdAt: 'desc' } });
        if (delib) await prisma.deliberation.update({ where: { id: delib.id }, data: { status: 'decided' } });
        updates.status = 'in_progress';
        break;

      case 'restart-deliberation':
        // Reset deliberation — the start-deliberation button will create a new one
        break;

      case 'manual-pr':
      case 'manual-fix':
        // Operator will create PR manually — just mark as in_progress
        updates.status = 'in_progress';
        break;

      case 'approve-pr':
        // Mark PR as approved / merged
        updates.status = 'done';
        break;

      case 'reject-pr':
        // PR rejected — stay in progress for rework
        updates.status = 'in_progress';
        break;

      case 'mark-tests-passed':
        // Mark tests as passing (for manual override)
        updates.status = 'done';
        break;

      case 'mark-deployed':
        updates.status = 'released';
        break;

      case 'mark-released':
        updates.status = 'released';
        break;

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      await prisma.story.update({ where: { id: storyId }, data: updates });
    }

    return NextResponse.json({ ok: true, action, storyId });
  } catch (error) {
    console.error('Lifecycle gate action error:', error);
    return NextResponse.json({ error: 'Failed to process gate action' }, { status: 500 });
  }
}
