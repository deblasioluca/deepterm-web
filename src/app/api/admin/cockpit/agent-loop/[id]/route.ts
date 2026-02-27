import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createAndRunAgentLoop } from '@/lib/agent-loop/engine';

export const dynamic = 'force-dynamic';

// GET: Get agent loop detail with all iterations
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const loop = await prisma.agentLoop.findUnique({
      where: { id },
      include: {
        config: true,
        story: {
          select: { title: true, status: true, priority: true, description: true },
        },
        iterations: {
          orderBy: { iteration: 'asc' },
        },
      },
    });

    if (!loop) {
      return NextResponse.json({ error: 'Agent loop not found' }, { status: 404 });
    }

    return NextResponse.json(loop);
  } catch (error) {
    console.error('Agent loop detail error:', error);
    return NextResponse.json({ error: 'Failed to get agent loop' }, { status: 500 });
  }
}

// PATCH: Update agent loop (cancel, approve, etc.)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { action } = body;

    const loop = await prisma.agentLoop.findUnique({ where: { id } });
    if (!loop) {
      return NextResponse.json({ error: 'Agent loop not found' }, { status: 404 });
    }

    switch (action) {
      case 'cancel': {
        if (!['queued', 'running'].includes(loop.status)) {
          return NextResponse.json({ error: 'Can only cancel queued/running loops' }, { status: 400 });
        }
        const updated = await prisma.agentLoop.update({
          where: { id },
          data: { status: 'cancelled', completedAt: new Date() },
        });
        return NextResponse.json(updated);
      }

      case 'approve': {
        if (loop.status !== 'awaiting_review') {
          return NextResponse.json({ error: 'Can only approve loops awaiting review' }, { status: 400 });
        }
        const updated = await prisma.agentLoop.update({
          where: { id },
          data: { status: 'completed' },
        });
        return NextResponse.json(updated);
      }

      case 'reject': {
        if (loop.status !== 'awaiting_review') {
          return NextResponse.json({ error: 'Can only reject loops awaiting review' }, { status: 400 });
        }
        const updated = await prisma.agentLoop.update({
          where: { id },
          data: {
            status: 'failed',
            errorLog: body.reason || 'Rejected by reviewer',
            completedAt: new Date(),
          },
        });
        return NextResponse.json(updated);
      }


      case 'retry': {
        if (!['failed', 'cancelled'].includes(loop.status)) {
          return NextResponse.json({ error: 'Can only retry failed or cancelled loops' }, { status: 400 });
        }

        // Collect feedback from the failed loop
        const iterations = await prisma.agentIteration.findMany({
          where: { loopId: id },
          orderBy: { iteration: 'desc' },
          take: 3,
        });

        const feedbackParts: string[] = [];
        if (loop.errorLog) feedbackParts.push(`Error: ${loop.errorLog}`);
        if (body.reason) feedbackParts.push(`Reviewer feedback: ${body.reason}`);

        for (const iter of iterations.reverse()) {
          feedbackParts.push(
            `--- Iteration ${iter.iteration} ---\n` +
            `Thinking: ${iter.thinking.slice(0, 500)}\n` +
            `Action: ${iter.action.slice(0, 1000)}\n` +
            `Observation: ${iter.observation}`
          );
        }

        const feedbackContext = feedbackParts.join('\n\n');

        // Create new loop with feedback
        const newLoopId = await createAndRunAgentLoop({
          storyId: loop.storyId || undefined,
          deliberationId: loop.deliberationId || undefined,
          configId: loop.configId || undefined,
          maxIterations: loop.maxIterations,
          feedbackContext,
        });

        return NextResponse.json({ newLoopId, retryOf: id });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Agent loop update error:', error);
    return NextResponse.json({ error: 'Failed to update agent loop' }, { status: 500 });
  }
}

// DELETE: Delete an agent loop and its iterations
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const loop = await prisma.agentLoop.findUnique({ where: { id } });
    if (!loop) {
      return NextResponse.json({ error: 'Agent loop not found' }, { status: 404 });
    }

    if (['queued', 'running'].includes(loop.status)) {
      return NextResponse.json({ error: 'Cannot delete active loops. Cancel first.' }, { status: 400 });
    }

    // Cascade delete handles iterations
    await prisma.agentLoop.delete({ where: { id } });

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Agent loop delete error:', error);
    return NextResponse.json({ error: 'Failed to delete agent loop' }, { status: 500 });
  }
}
