import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time deliberation progress updates.
 * Polls the database every 2 seconds and emits changes.
 * Client connects via: new EventSource('/api/admin/cockpit/deliberation/{id}/stream')
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const deliberationId = params.id;

  const encoder = new TextEncoder();
  let lastStatus = '';
  let lastProposalCount = 0;
  let lastDebateCount = 0;
  let lastVoteCount = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Initial state
      const initial = await prisma.deliberation.findUnique({
        where: { id: deliberationId },
        include: {
          _count: { select: { proposals: true, debates: true, votes: true } },
        },
      });

      if (!initial) {
        send('error', { message: 'Deliberation not found' });
        controller.close();
        return;
      }

      lastStatus = initial.status;
      lastProposalCount = initial._count.proposals;
      lastDebateCount = initial._count.debates;
      lastVoteCount = initial._count.votes;

      send('status', {
        status: initial.status,
        proposals: lastProposalCount,
        debates: lastDebateCount,
        votes: lastVoteCount,
        title: initial.title,
      });

      // Poll every 2 seconds
      const interval = setInterval(async () => {
        if (closed) {
          clearInterval(interval);
          return;
        }

        try {
          const current = await prisma.deliberation.findUnique({
            where: { id: deliberationId },
            include: {
              _count: { select: { proposals: true, debates: true, votes: true } },
              proposals: { orderBy: { createdAt: 'desc' }, take: 1, select: { agentName: true, agentModel: true } },
              debates: { orderBy: { createdAt: 'desc' }, take: 1, select: { agentName: true, round: true } },
              votes: { orderBy: { createdAt: 'desc' }, take: 1, select: { agentName: true, votedFor: true } },
            },
          });

          if (!current) {
            send('error', { message: 'Deliberation deleted' });
            clearInterval(interval);
            controller.close();
            return;
          }

          // Emit new proposals
          if (current._count.proposals > lastProposalCount) {
            const latest = current.proposals[0];
            send('proposal', {
              agentName: latest?.agentName,
              agentModel: latest?.agentModel,
              total: current._count.proposals,
            });
            lastProposalCount = current._count.proposals;
          }

          // Emit new debates
          if (current._count.debates > lastDebateCount) {
            const latest = current.debates[0];
            send('debate', {
              agentName: latest?.agentName,
              round: latest?.round,
              total: current._count.debates,
            });
            lastDebateCount = current._count.debates;
          }

          // Emit new votes
          if (current._count.votes > lastVoteCount) {
            const latest = current.votes[0];
            send('vote', {
              agentName: latest?.agentName,
              votedFor: latest?.votedFor,
              total: current._count.votes,
            });
            lastVoteCount = current._count.votes;
          }

          // Emit status changes
          if (current.status !== lastStatus) {
            send('status', {
              status: current.status,
              proposals: current._count.proposals,
              debates: current._count.debates,
              votes: current._count.votes,
            });
            lastStatus = current.status;

            // Close stream when deliberation is terminal
            if (current.status === 'decided' || current.status === 'failed') {
              send('complete', {
                status: current.status,
                summary: current.status === 'decided' ? current.managementSummary || 'Complete' : current.error || 'Failed',
              });
              clearInterval(interval);
              controller.close();
              closed = true;
            }
          }
        } catch (err) {
          console.error('[SSE] Poll error:', err);
        }
      }, 2000);

      // Close after 10 minutes max (prevent zombie connections on Pi)
      setTimeout(() => {
        if (!closed) {
          closed = true;
          clearInterval(interval);
          send('timeout', { message: 'Stream timeout — reconnect to continue' });
          controller.close();
        }
      }, 10 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
