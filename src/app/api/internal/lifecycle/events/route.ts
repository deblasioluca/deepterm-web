import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/internal/lifecycle/events
 * 
 * Authenticated event ingestion for CI workflows and agent loop engine.
 * Headers: x-api-key (must match AI_DEV_API_KEY or NODE_RED_API_KEY)
 * 
 * Supported events:
 *   started, progress, heartbeat, completed, failed, timeout,
 *   cancelled, skipped, retried, reset, loop-back
 * 
 * Body: { storyId, stepId, event, detail?, actor? }
 */

const API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const apiKey = req.headers.get('x-api-key');
    if (!API_KEY || apiKey !== API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
      return NextResponse.json(
        { error: `Invalid event type: ${event}. Valid: ${validEvents.join(', ')}` },
        { status: 400 }
      );
    }

    // Serialize detail
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
      const story = await prisma.story.findUnique({
        where: { id: storyId },
        select: { lifecycleStartedAt: true },
      });
      if (story?.lifecycleStartedAt) {
        const duration = Math.round((Date.now() - story.lifecycleStartedAt.getTime()) / 1000);
        await prisma.stepDurationHistory.create({
          data: { stepId, duration, storyId },
        });
      }
      updateData.lifecycleHeartbeat = null;
    }

    if (event === 'failed') {
      updateData.lifecycleHeartbeat = null;
    }

    if (event === 'loop-back') {
      // Parse loop-back detail for target step
      let parsed: { to?: string; from?: string } = {};
      try {
        parsed = detailStr ? JSON.parse(detailStr) : {};
      } catch {
        // ignore parse errors
      }

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
    console.error('Internal lifecycle event error:', error);
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
  }
}
