import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { advanceDeliberation } from '@/lib/deliberation/engine';

export const dynamic = 'force-dynamic';

// POST: Advance deliberation to the next phase (fire-and-forget)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deliberation = await prisma.deliberation.findUnique({ where: { id: params.id } });
    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 });
    }

    if (deliberation.status === 'decided' || deliberation.status === 'failed') {
      return NextResponse.json({
        id: deliberation.id,
        status: deliberation.status,
        message: `Deliberation is already ${deliberation.status}`,
      });
    }

    if (deliberation.status === 'proposing') {
      return NextResponse.json({
        id: deliberation.id,
        status: 'proposing',
        message: 'Still generating proposals — wait for completion',
      });
    }

    // Fire-and-forget: advance in background
    advanceDeliberation(params.id).catch(err => {
      console.error(`[Deliberation] Background advance failed for ${params.id}:`, err);
    });

    return NextResponse.json({
      id: deliberation.id,
      status: deliberation.status,
      message: 'Advancing to next phase...',
    });
  } catch (error) {
    console.error('Deliberation advance error:', error);
    return NextResponse.json({ error: 'Failed to advance deliberation' }, { status: 500 });
  }
}
