import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runFullDeliberation } from '@/lib/deliberation/engine';

export const dynamic = 'force-dynamic';

// POST: Run all remaining phases automatically (fire-and-forget)
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const deliberation = await prisma.deliberation.findUnique({ where: { id: params.id } });
    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 });
    }

    if (deliberation.status === 'decided') {
      return NextResponse.json({
        id: deliberation.id,
        status: 'decided',
        message: 'Deliberation already completed',
      });
    }

    if (deliberation.status === 'failed') {
      // Reset to debating so it can retry
      await prisma.deliberation.update({
        where: { id: params.id },
        data: { status: 'debating', error: null },
      });
    }

    // Fire-and-forget
    runFullDeliberation(params.id).catch(err => {
      console.error(`[Deliberation] Background auto-run failed for ${params.id}:`, err);
    });

    return NextResponse.json({
      id: deliberation.id,
      status: deliberation.status,
      message: 'Running all phases automatically...',
    });
  } catch (error) {
    console.error('Deliberation auto error:', error);
    return NextResponse.json({ error: 'Failed to start auto-run' }, { status: 500 });
  }
}
