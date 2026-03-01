import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Auth: CI and agent POST requests must include x-api-key header
// Cockpit UI GET requests are session-authenticated (admin panel)
const LIFECYCLE_API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';

function isAuthorizedPost(req: NextRequest): boolean {
  if (!LIFECYCLE_API_KEY) return false;
  const apiKey = req.headers.get('x-api-key');
  return apiKey === LIFECYCLE_API_KEY;
}

// GET /api/admin/cockpit/lifecycle/events?storyId=xxx[&stepId=yyy]
// Returns lifecycle events for a story (optionally filtered by step)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const stepId = searchParams.get('stepId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const event = searchParams.get('event'); // Optional: filter by event type

    if (!storyId) {
      return NextResponse.json({ error: 'storyId required' }, { status: 400 });
    }

    const where: Record<string, unknown> = { storyId };
    if (stepId) where.stepId = stepId;
    if (event) where.event = event;

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

// POST /api/admin/cockpit/lifecycle/events
// Used by: CI workflows, agent loop engine, and internal systems
// Required headers: x-api-key (matches AI_DEV_API_KEY or NODE_RED_API_KEY)
//
// Supported events:
//   started, progress, heartbeat, completed, failed, timeout,
//   cancelled, skipped, retried, reset, loop-back
export async function POST(req: NextRequest) {
  try {
    // Auth check — CI and agent must authenticate
    // Allow localhost/internal calls without key (cockpit UI calls from same server)
    const host = req.headers.get('host') || '';
    const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('10.10.10.10');
    
    if (!isLocalhost && !isAuthorizedPost(req)) {
      return NextResponse.json({ error: 'Unauthorized — x-api-key required' }, { status: 401 });
    }

    const body = await req.json();
    const { storyId, stepId, event, detail, actor } = body;
    
    if (!storyId || !stepId || !event) {
      return NextResponse.json({ error: 'storyId, stepId, and event required' }, { status: 400 });
    }

    // Validate event type
    const validEvents = [
      'started', 'progress', 'heartbeat', 'completed', 'failed',
      'timeout', 'cancelled', 'skipped', 'retried', 'reset', 'loop-back'
    ];
    if (!validEvents.includes(event)) {
      return NextResponse.json({ error: `Invalid event type: ${event}. Valid: ${validEvents.join(', ')}` }, { status: 400 });
    }

    // Serialize detail to string if it's an object
    const detailStr = typeof detail === 'string' ? detail : detail ? JSON.stringify(detail) : null;

    // Create the event
    const ev = await prisma.lifecycleEvent.create({
      data: {
        storyId,
        stepId,
        event,
        detail: detailStr,
        actor: actor || 'system',
      },
    });

    // Side effects based on event type
    const updateData: Record<string, unknown> = {};

    if (event === 'heartbeat' || event === 'progress') {
      updateData.lifecycleHeartbeat = new Date();
    }

    if (event === 'started') {
      updateData.lifecycleStep = stepId;
      updateData.lifecycleStartedAt = new Date();
      updateData.lifecycleHeartbeat = new Date();
    }

    if (event === 'completed') {
      // Record step duration for ETA tracking
      const story = await prisma.story.findUnique({ where: { id: storyId }, select: { lifecycleStartedAt: true, scope: true } });
      if (story?.lifecycleStartedAt) {
        const duration = Math.round((Date.now() - story.lifecycleStartedAt.getTime()) / 1000);
        await prisma.stepDurationHistory.create({
          data: { stepId, duration, storyId },
        });
      }
      updateData.lifecycleHeartbeat = null;

      // Auto-advance to next step when a step completes
      const STEP_ORDER = ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];
      const currentIdx = STEP_ORDER.indexOf(stepId);
      const nextStep = currentIdx >= 0 && currentIdx < STEP_ORDER.length - 1 ? STEP_ORDER[currentIdx + 1] : null;
      if (nextStep) {
        updateData.lifecycleStep = nextStep;
        updateData.lifecycleStartedAt = new Date();
        // Log the next step as started
        await prisma.lifecycleEvent.create({
          data: {
            storyId,
            stepId: nextStep,
            event: 'started',
            detail: JSON.stringify({ message: `Auto-advanced from ${stepId}` }),
            actor: 'system',
          },
        });
      }
      // If last step completes, mark story as done
      if (stepId === 'release') {
        updateData.lifecycleStep = 'done';
        // Update story status to completed
        await prisma.story.update({ where: { id: storyId }, data: { status: 'completed' } });
      }
    }

    if (event === 'failed') {
      updateData.lifecycleHeartbeat = null;
    }

    if (event === 'loop-back') {
      // Parse loop-back detail for target step
      let parsed: { to?: string; from?: string } = {};
      try { parsed = detailStr ? JSON.parse(detailStr) : {}; } catch { /* ignore */ }

      if (parsed.to) {
        updateData.lifecycleStep = parsed.to;
        updateData.lifecycleStartedAt = new Date();
        updateData.lifecycleHeartbeat = new Date();
        updateData.lastLoopFrom = parsed.from || stepId;
        updateData.lastLoopTo = parsed.to;
      }
      // Increment loop counter
      await prisma.story.update({
        where: { id: storyId },
        data: { loopCount: { increment: 1 } },
      });
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.story.update({ where: { id: storyId }, data: updateData });
    }

    return NextResponse.json({ ok: true, id: ev.id, event });
  } catch (error) {
    console.error('Lifecycle event create error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
