import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET /api/admin/cockpit/lifecycle/events?storyId=xxx[&stepId=yyy]
// Returns lifecycle events for a story (optionally filtered by step)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const stepId = searchParams.get('stepId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    if (!storyId) {
      return NextResponse.json({ error: 'storyId required' }, { status: 400 });
    }

    const where: Record<string, unknown> = { storyId };
    if (stepId) where.stepId = stepId;

    const events = await prisma.lifecycleEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200),
    });

    return NextResponse.json({ events: events.reverse() });
  } catch (error) {
    console.error('Lifecycle events error:', error);
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

// POST /api/admin/cockpit/lifecycle/events — Log an event (used by heartbeat, progress updates, etc.)
export async function POST(req: NextRequest) {
  try {
    const { storyId, stepId, event, detail, actor } = await req.json();
    if (!storyId || !stepId || !event) {
      return NextResponse.json({ error: 'storyId, stepId, and event required' }, { status: 400 });
    }

    const ev = await prisma.lifecycleEvent.create({
      data: {
        storyId,
        stepId,
        event,
        detail: typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null,
        actor: actor || 'system',
      },
    });

    // Update heartbeat on story if this is a heartbeat or progress event
    if (event === 'heartbeat' || event === 'progress' || event === 'started') {
      const updateData: Record<string, unknown> = { lifecycleHeartbeat: new Date() };
      if (event === 'started') {
        updateData.lifecycleStep = stepId;
        updateData.lifecycleStartedAt = new Date();
      }
      await prisma.story.update({ where: { id: storyId }, data: updateData });
    }

    return NextResponse.json({ ok: true, id: ev.id });
  } catch (error) {
    console.error('Lifecycle event create error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
