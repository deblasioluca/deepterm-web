import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const epicId = req.nextUrl.searchParams.get('epicId');

    const where = epicId ? { epicId } : {};

    const stories = await prisma.story.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json(stories);
  } catch (error) {
    console.error('Planning stories GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch stories' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, epicId, description, priority, status, githubIssueNumber, scope, lifecycleTemplate } = body as {
      title?: string;
      epicId?: string;
      description?: string;
      priority?: string;
      status?: string;
      githubIssueNumber?: number;
      scope?: string;
      lifecycleTemplate?: string;
    };

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'title is required' },
        { status: 400 },
      );
    }

    // Place new story at the end by default
    const maxSort = await prisma.story.aggregate({ _max: { sortOrder: true } });
    const nextSort = (maxSort._max.sortOrder ?? -1) + 1;

    const story = await prisma.story.create({
      data: {
        title: title.trim(),
        epicId: epicId ?? null,
        description: description ?? '',
        priority: priority ?? 'medium',
        status: status ?? 'backlog',
        githubIssueNumber: githubIssueNumber ?? null,
        scope: scope ?? 'app',
        lifecycleTemplate: lifecycleTemplate ?? 'full',
        sortOrder: nextSort,
      },
    });

    return NextResponse.json(story, { status: 201 });
  } catch (error) {
    console.error('Planning stories POST error:', error);
    return NextResponse.json({ error: 'Failed to create story' }, { status: 500 });
  }
}
