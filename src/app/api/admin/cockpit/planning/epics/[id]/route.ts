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
    const { title, description, status, priority, sortOrder } = body as {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      sortOrder?: number;
    };

    const data: Record<string, string | number> = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (status !== undefined) data.status = status;
    if (priority !== undefined) data.priority = priority;
    if (sortOrder !== undefined) data.sortOrder = sortOrder;

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'No fields to update' },
        { status: 400 },
      );
    }

    const epic = await prisma.epic.update({
      where: { id },
      data,
      include: {
        stories: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return NextResponse.json(epic);
  } catch (error) {
    console.error('Planning epic PATCH error:', error);
    return NextResponse.json({ error: 'Failed to update epic' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const { id } = params;

    await prisma.epic.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Planning epic DELETE error:', error);
    return NextResponse.json({ error: 'Failed to delete epic' }, { status: 500 });
  }
}
