import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const epics = await prisma.epic.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        stories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json(epics);
  } catch (error) {
    console.error('Planning epics GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch epics' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, description, priority, status } = body as {
      title?: string;
      description?: string;
      priority?: string;
      status?: string;
    };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'title is required' },
        { status: 400 },
      );
    }

    // Place new epic at the end by default
    const maxSort = await prisma.epic.aggregate({ _max: { sortOrder: true } });
    const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const epic = await prisma.epic.create({
      data: {
        title: title.trim(),
        description: description ?? '',
        priority: priority ?? 'medium',
        status: status ?? 'backlog',
        sortOrder: nextSort,
      },
    });

    return NextResponse.json(epic, { status: 201 });
  } catch (error) {
    console.error('Planning epics POST error:', error);
    return NextResponse.json({ error: 'Failed to create epic' }, { status: 500 });
  }
}
