import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, items } = body as {
      type?: string;
      items?: { id: string; sortOrder: number }[];
    };

    if (type !== 'epic' && type !== 'story') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'type must be "epic" or "story"' },
        { status: 400 },
      );
    }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'items must be a non-empty array' },
        { status: 400 },
      );
    }

    // Validate each item has id (string) and sortOrder (number)
    for (const item of items) {
      if (typeof item.id !== 'string' || typeof item.sortOrder !== 'number') {
        return NextResponse.json(
          { error: 'Bad Request', message: 'Each item must have id (string) and sortOrder (number)' },
          { status: 400 },
        );
      }
    }

    if (type === 'epic') {
      await prisma.$transaction(
        items.map((item) =>
          prisma.epic.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );
    } else {
      await prisma.$transaction(
        items.map((item) =>
          prisma.story.update({
            where: { id: item.id },
            data: { sortOrder: item.sortOrder },
          }),
        ),
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Planning reorder POST error:', error);
    return NextResponse.json({ error: 'Failed to reorder items' }, { status: 500 });
  }
}
