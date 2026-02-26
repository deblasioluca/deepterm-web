import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: Full deliberation details including all proposals, debates, votes
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deliberation = await prisma.deliberation.findUnique({
      where: { id: params.id },
      include: {
        proposals: { orderBy: { createdAt: 'asc' } },
        debates: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
        votes: { orderBy: { createdAt: 'asc' } },
        story: { select: { id: true, title: true, status: true, priority: true, githubIssueNumber: true } },
        epic: { select: { id: true, title: true, status: true, priority: true } },
      },
    });

    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 });
    }

    return NextResponse.json(deliberation);
  } catch (error) {
    console.error('Deliberation get error:', error);
    return NextResponse.json({ error: 'Failed to get deliberation' }, { status: 500 });
  }
}

// DELETE: Remove deliberation and all children (cascade)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.deliberation.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Deliberation delete error:', error);
    return NextResponse.json({ error: 'Failed to delete deliberation' }, { status: 500 });
  }
}
