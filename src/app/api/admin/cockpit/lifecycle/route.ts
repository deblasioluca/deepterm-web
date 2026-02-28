import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Helper: log a lifecycle event
async function logEvent(storyId: string, stepId: string, event: string, detail?: string, actor?: string) {
  return prisma.lifecycleEvent.create({
    data: { storyId, stepId, event, detail, actor: actor || 'system' },
  });
}

// Step ordering for reset-to-step logic
const STEP_ORDER = ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];

// Step timeout defaults (seconds) — null means human-gated, no timeout
const STEP_TIMEOUTS: Record<string, number | null> = {
  triage: null,
  plan: null,
  deliberation: 300,
  implement: 600,
  test: 300,
  review: null,
  deploy: 600,
  release: 120,
};

// GET /api/admin/cockpit/lifecycle?storyId=xxx or ?status=in_progress
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const storyId = searchParams.get('storyId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (storyId) where.id = storyId;
    if (status) where.status = status;
    if (!storyId && !status) {
      // Find epics that are active OR have stories with lifecycle activity
      const activeEpics = await prisma.epic.findMany({
        where: {
          OR: [
            { stories: { some: { status: { in: ['planned', 'in_progress', 'done'] } } } },
            { status: { in: ['in_progress', 'planned', 'active'] } },
          ],
        },
        select: { id: true },
      });
      const epicIds = activeEpics.map(e => e.id);

      // Also find stories with lifecycle activity (deliberations, agent loops, etc.)
      // even if their status is still backlog
      const storiesWithActivity = await prisma.story.findMany({
        where: {
          OR: [
            { deliberations: { some: {} } },
            { agentLoops: { some: {} } },
            { lifecycleStep: { not: null } },
          ],
        },
        select: { id: true },
      });
      const activityIds = storiesWithActivity.map(s => s.id);

      where.OR = [
        { status: { in: ['planned', 'in_progress', 'done'] } },
        ...(epicIds.length > 0 ? [{ epicId: { in: epicIds } }] : []),
        ...(activityIds.length > 0 ? [{ id: { in: activityIds } }] : []),
      ];
    }

    const stories = await prisma.story.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        epic: { select: { id: true, title: true, status: true } },
      },
    });

    const enriched = await Promise.all(stories.map(async (story) => {
      const deliberation = await prisma.deliberation.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true },
      }).catch(() => null);

      const agentLoop = await prisma.agentLoop.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, prNumber: true, prUrl: true, startedAt: true, completedAt: true },
      }).catch(() => null);

      // Get recent lifecycle events for this story (last 5 per step for the active step)
      const recentEvents = await prisma.lifecycleEvent.findMany({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }).catch(() => []);

      return {
        id: story.id,
        title: story.title,
        status: story.status,
        epicId: story.epicId,
        epicTitle: story.epic?.title,
        epicStatus: story.epic?.status || null,
        triageApproved: story.status !== 'backlog' ? true : null,
        deliberationStatus: deliberation?.status || null,
        deliberationId: deliberation?.id || null,
        agentLoopStatus: agentLoop?.status || null,
        agentLoopId: agentLoop?.id || null,
        prNumber: agentLoop?.prNumber || null,
        prUrl: agentLoop?.prUrl || null,
        prMerged: story.status === 'done' || story.status === 'released',
        testsPass: story.status === 'done' || story.status === 'released' ? true : null,
        deployed: story.status === 'released',
        released: story.status === 'released',
        version: null,
        releaseNotesDone: story.status === 'released',
        emailSent: story.status === 'released',
        docsUpdated: story.status === 'released',
        // Lifecycle resilience data
        lifecycleStep: story.lifecycleStep,
        lifecycleStartedAt: story.lifecycleStartedAt?.toISOString() || null,
        lifecycleHeartbeat: story.lifecycleHeartbeat?.toISOString() || null,
        stepTimeouts: STEP_TIMEOUTS,
        recentEvents: recentEvents.reverse().map(e => ({
          id: e.id,
          stepId: e.stepId,
          event: e.event,
          detail: e.detail,
          actor: e.actor,
          createdAt: e.createdAt.toISOString(),
        })),
      };
    }));

    return NextResponse.json({ stories: enriched });
  } catch (error) {
    console.error('Lifecycle API error:', error);
    return NextResponse.json({ error: 'Failed to fetch lifecycle data' }, { status: 500 });
  }
}

// POST /api/admin/cockpit/lifecycle — Gate + recovery actions
export async function POST(req: NextRequest) {
  try {
    const { action, storyId, reason, stepId } = await req.json();
    if (!storyId || !action) {
      return NextResponse.json({ error: 'storyId and action required' }, { status: 400 });
    }

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

    const updates: Record<string, unknown> = {};

    switch (action) {
      // ── Existing gate actions ──
      case 'skip-deliberation':
        await prisma.deliberation.create({
          data: { type: 'implementation', status: 'decided', storyId, title: 'Skipped', summary: 'Deliberation skipped by operator.' },
        });
        updates.status = 'in_progress';
        await logEvent(storyId, 'deliberation', 'skipped', reason || 'Operator skipped deliberation', 'human');
        break;

      case 'approve-decision': {
        const delib = await prisma.deliberation.findFirst({ where: { storyId }, orderBy: { createdAt: 'desc' } });
        if (delib) await prisma.deliberation.update({ where: { id: delib.id }, data: { status: 'decided' } });
        updates.status = 'in_progress';
        await logEvent(storyId, 'deliberation', 'completed', 'Decision approved by operator', 'human');
        break;
      }

      case 'restart-deliberation':
        await logEvent(storyId, 'deliberation', 'retried', reason || 'Operator restarted deliberation', 'human');
        break;

      case 'manual-pr':
      case 'manual-fix':
        updates.status = 'in_progress';
        await logEvent(storyId, 'implement', 'progress', `Manual ${action === 'manual-pr' ? 'PR' : 'fix'} by operator`, 'human');
        break;

      case 'approve-pr':
        updates.status = 'done';
        await logEvent(storyId, 'review', 'completed', 'PR approved and merged', 'human');
        break;

      case 'reject-pr':
        updates.status = 'in_progress';
        await logEvent(storyId, 'review', 'failed', reason || 'Changes requested', 'human');
        break;

      case 'mark-tests-passed':
        updates.status = 'done';
        await logEvent(storyId, 'test', 'completed', 'Tests manually marked as passed', 'human');
        break;

      case 'mark-deployed':
        updates.status = 'released';
        await logEvent(storyId, 'deploy', 'completed', 'Manually marked as deployed', 'human');
        break;

      case 'mark-released':
        updates.status = 'released';
        await logEvent(storyId, 'release', 'completed', 'Manually marked as released', 'human');
        break;

      // ── Recovery actions ──
      case 'retry-step': {
        if (!stepId) return NextResponse.json({ error: 'stepId required for retry-step' }, { status: 400 });
        updates.lifecycleStep = stepId;
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = new Date();
        await logEvent(storyId, stepId, 'retried', reason || `Step retried by operator`, 'human');
        break;
      }

      case 'skip-step': {
        if (!stepId) return NextResponse.json({ error: 'stepId required for skip-step' }, { status: 400 });
        const currentIdx = STEP_ORDER.indexOf(stepId);
        const nextStep = currentIdx < STEP_ORDER.length - 1 ? STEP_ORDER[currentIdx + 1] : null;
        updates.lifecycleStep = nextStep;
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = new Date();
        await logEvent(storyId, stepId, 'skipped', reason || `Step skipped by operator`, 'human');
        if (nextStep) await logEvent(storyId, nextStep, 'started', `Started after ${stepId} was skipped`, 'system');
        break;
      }

      case 'cancel-step': {
        if (!stepId) return NextResponse.json({ error: 'stepId required for cancel-step' }, { status: 400 });
        // Cancel any running agent loops
        if (stepId === 'implement') {
          await prisma.agentLoop.updateMany({
            where: { storyId, status: { in: ['queued', 'running'] } },
            data: { status: 'cancelled' },
          });
        }
        updates.lifecycleStep = stepId;
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        await logEvent(storyId, stepId, 'cancelled', reason || `Step cancelled by operator`, 'human');
        break;
      }

      case 'reset-to-step': {
        if (!stepId) return NextResponse.json({ error: 'stepId required for reset-to-step' }, { status: 400 });
        const resetIdx = STEP_ORDER.indexOf(stepId);
        if (resetIdx < 0) return NextResponse.json({ error: `Unknown step: ${stepId}` }, { status: 400 });

        // Reset story status based on target step
        if (resetIdx <= 1) updates.status = 'planned';
        else updates.status = 'in_progress';

        updates.lifecycleStep = stepId;
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = null;
        await logEvent(storyId, stepId, 'reset', reason || `Story reset to ${stepId} by operator`, 'human');
        break;
      }

      case 'reset-all': {
        updates.status = 'backlog';
        updates.lifecycleStep = null;
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        await logEvent(storyId, 'triage', 'reset', reason || 'Story fully reset by operator', 'human');
        break;
      }

      case 'force-complete': {
        updates.status = 'released';
        updates.lifecycleStep = 'release';
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        await logEvent(storyId, 'release', 'completed', reason || 'Story force-completed by operator', 'human');
        break;
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    if (Object.keys(updates).length > 0) {
      await prisma.story.update({ where: { id: storyId }, data: updates });
    }

    return NextResponse.json({ ok: true, action, storyId });
  } catch (error) {
    console.error('Lifecycle gate action error:', error);
    return NextResponse.json({ error: 'Failed to process gate action' }, { status: 500 });
  }
}
