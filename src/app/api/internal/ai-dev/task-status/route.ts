/**
 * POST /api/internal/ai-dev/task-status
 *
 * Updates Story status from the AI Dev Mac.
 * Enforces valid transitions and notifies Node-RED.
 *
 * Headers: x-api-key (must match AI_DEV_API_KEY or NODE_RED_API_KEY)
 * Body:    { storyId: string, status: string, prUrl?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_DEV_API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';
const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

const VALID_STATUSES = ['planned', 'in_progress', 'done'] as const;
const VALID_TRANSITIONS: Record<string, string[]> = {
  backlog: ['planned'],
  planned: ['in_progress'],
  in_progress: ['done', 'planned'],  // allow reverting to planned
  done: ['released', 'in_progress'], // allow reopening
};

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!AI_DEV_API_KEY || apiKey !== AI_DEV_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { storyId, status, prUrl } = body as {
      storyId?: string;
      status?: string;
      prUrl?: string;
    };

    if (!storyId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: storyId, status' },
        { status: 400 }
      );
    }

    if (!VALID_STATUSES.includes(status as typeof VALID_STATUSES[number]) && status !== 'released') {
      return NextResponse.json(
        { error: `Invalid status. Allowed: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    // Fetch current story
    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) {
      return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // Validate transition
    const allowed = VALID_TRANSITIONS[story.status];
    if (allowed && !allowed.includes(status)) {
      return NextResponse.json(
        { error: `Cannot transition from '${story.status}' to '${status}'. Allowed: ${allowed.join(', ')}` },
        { status: 400 }
      );
    }

    // Update story
    const updated = await prisma.story.update({
      where: { id: storyId },
      data: { status },
    });

    // Notify Node-RED
    try {
      await fetch(`${NODE_RED_URL}/deepterm/planning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'story-status-change',
          storyId,
          title: updated.title,
          oldStatus: story.status,
          newStatus: status,
          source: 'ai-dev-mac',
          prUrl: prUrl || null,
        }),
      });
    } catch {
      // Node-RED notification is non-fatal
    }

    return NextResponse.json({
      ok: true,
      story: updated,
      transition: `${story.status} → ${status}`,
    });
  } catch (error) {
    console.error('AI Dev task-status error:', error);
    return NextResponse.json({ error: 'Failed to update status' }, { status: 500 });
  }
}
