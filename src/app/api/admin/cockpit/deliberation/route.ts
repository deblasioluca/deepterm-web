import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startDeliberation } from '@/lib/deliberation/engine';

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

    // Verify target exists
    if (storyId) {
      const story = await prisma.story.findUnique({ where: { id: storyId } });
      if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });
    }
    if (epicId) {
      const epic = await prisma.epic.findUnique({ where: { id: epicId } });
      if (!epic) return NextResponse.json({ error: 'Epic not found' }, { status: 404 });
    }

    const deliberation = await prisma.deliberation.create({
      data: {
        type,
        status: 'proposing',
        storyId: storyId || null,
        epicId: epicId || null,
        title: title || '',
        instructions: instructions || '',
      },
    });

    // Fire-and-forget: start the proposal phase in the background
    startDeliberation(deliberation.id).catch(err => {
      console.error(`[Deliberation] Background start failed for ${deliberation.id}:`, err);
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
