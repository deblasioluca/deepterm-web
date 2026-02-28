import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { title, description, status, priority, epicId, sortOrder, githubIssueNumber, scope, lifecycleTemplate } = body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      epicId?: string | null;
      sortOrder?: number;
      githubIssueNumber?: number | null;
      scope?: string;
      lifecycleTemplate?: string;
    };

    const data: Record<string, string | number | null> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (epicId !== undefined) data.epicId = epicId;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;
    if (githubIssueNumber !== undefined) data.githubIssueNumber = githubIssueNumber;
    if (scope !== undefined) data.scope = scope;
    if (lifecycleTemplate !== undefined) data.lifecycleTemplate = lifecycleTemplate;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'No fields to update' },
        { status: 400 },
      );
    }

    const story = await prisma.story.update({
      where: { id },
      data,
    });

    return NextResponse.json(story);
  } catch (error) {
    console.error('Planning story PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update story' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    await prisma.story.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Planning story DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete story' }, { status: 500 });
  }
}
