import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAndRunAgentLoop } from '@/lib/agent-loop/engine';

export const dynamic = 'force-dynamic';

// GET: List agent loops with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status');
    const storyId = searchParams.get('storyId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (storyId) where.storyId = storyId;

    const loops = await prisma.agentLoop.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        config: { select: { name: true, model: true, provider: true } },
        story: { select: { title: true, status: true, priority: true } },
        _count: { select: { iterations: true } },
      },
    });

    // Also get aggregate stats
    const stats = await prisma.agentLoop.groupBy({
      by: ['status'],
      _count: true,
    });

    return NextResponse.json({ loops, stats });
  } catch (error) {
    console.error('Agent loop list error:', error);
    return NextResponse.json({ error: 'Failed to list agent loops' }, { status: 500 });
  }
}

// POST: Create and start a new agent loop
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { storyId, deliberationId, configId, maxIterations } = body;

    // Validate story exists if provided
    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }

    // Validate config exists if provided
    if (configId) {
      const config = await prisma.agentLoopConfig.findUnique({ where: { id: configId } });
      if (!config) return NextResponse.json({ error: 'Config not found' }, { status: 404 });
      if (!config.isEnabled) return NextResponse.json({ error: 'Config is disabled' }, { status: 400 });
    }

    // Check no running loops for the same story
    if (storyId) {
      const running = await prisma.agentLoop.findFirst({
        where: { storyId, status: { in: ['queued', 'running'] } },
      });
      if (running) {
        return NextResponse.json(
          { error: 'A loop is already running for this story', existingLoopId: running.id },
          { status: 409 }
        );
      }
    }

    const loopId = await createAndRunAgentLoop({
      storyId,
      deliberationId,
      configId,
      maxIterations,
    });

    return NextResponse.json({ id: loopId, status: 'queued' }, { status: 201 });
  } catch (error) {
    console.error('Agent loop create error:', error);
    return NextResponse.json({ error: 'Failed to create agent loop' }, { status: 500 });
  }
}
