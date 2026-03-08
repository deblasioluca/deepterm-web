import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runFullDeliberation } from '@/lib/deliberation/engine';

export const dynamic = 'force-dynamic';

// POST: Create and start a new deliberation
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, storyId, epicId, title, instructions } = body;

    if (!type || !['implementation', 'architecture_review'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    if (type === 'implementation' && !storyId && !epicId) {
      return NextResponse.json({ error: 'storyId or epicId required for implementation deliberation' }, { status: 400 });
    }

    // Resolve storyId: if epic-level and epic has exactly one story, auto-link it
    let resolvedStoryId = storyId || null;

    // Verify target exists
    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    if (epicId) {
      const epic = await prisma.epic.findUnique({
        where: { id: epicId },
        include: { stories: { select: { id: true } } },
      });
      if (!epic) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
      // Auto-link the story if epic has exactly one
      if (!resolvedStoryId && epic.stories.length === 1) {
        resolvedStoryId = epic.stories[0].id;
      }
    }

    const deliberation = await prisma.deliberation.create({
      data: {
        type,
        status: 'proposing',
        storyId: resolvedStoryId,
        epicId: epicId || null,
        title: title || '',
        instructions: instructions || '',
      },
    });

    // Move story/epic out of backlog when deliberation starts
    if (resolvedStoryId) {
      await prisma.story.updateMany({
        where: { id: resolvedStoryId, status: 'backlog' },
        data: { status: 'planned' },
      });
    }
    if (epicId) {
      await prisma.epic.updateMany({
        where: { id: epicId, status: 'backlog' },
        data: { status: 'planned' },
      });
    }

    // Fire-and-forget: run full deliberation (proposing → debating → voting → decided)
    runFullDeliberation(deliberation.id).catch(err => {
      console.error(`[Deliberation] Background run failed for ${deliberation.id}:`, err);
    });

    return NextResponse.json({
      id: deliberation.id,
      status: deliberation.status,
      type: deliberation.type,
    }, { status: 201 });
  } catch (error) {
    console.error('Deliberation create error:', error);
    return NextResponse.json({ error: 'Failed to create deliberation' }, { status: 500 });
  }
}

// GET: List deliberations with optional filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const epicId = searchParams.get('epicId');
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (storyId) where.storyId = storyId;
    if (epicId) where.epicId = epicId;
    if (type) where.type = type;
    if (status) where.status = status;

    const deliberations = await prisma.deliberation.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: {
          select: {
            proposals: true,
            debates: true,
            votes: true,
          },
        },
      },
    });

    return NextResponse.json(deliberations);
  } catch (error) {
    console.error('Deliberation list error:', error);
    return NextResponse.json({ error: 'Failed to list deliberations' }, { status: 500 });
  }
}
