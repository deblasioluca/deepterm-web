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
        epic: { select: { id: true, title: true } },
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
