import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { closePR, deleteBranch, commentOnPR, findStoryPR } from '@/lib/github-pulls';

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const CI_REPO = 'deblasioluca/deepterm';

// Helper: dispatch pr-check.yml on the CI Mac with story context
async function dispatchCIWorkflow(storyId: string) {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not configured — cannot dispatch CI workflow');
    return { ok: false, error: 'GITHUB_TOKEN not configured' };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${CI_REPO}/actions/workflows/pr-check.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { story_id: storyId },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.status === 204) {
      console.log(`CI workflow dispatched for story ${storyId}`);
      return { ok: true };
    }
    const body = await res.text();
    console.error(`CI dispatch failed: ${res.status} ${body}`);
    return { ok: false, error: `GitHub returned ${res.status}` };
  } catch (e) {
    console.error('CI dispatch error:', e);
    return { ok: false, error: String(e) };
  }
}


// Helper: send loop-back webhook to Node-RED
async function notifyLoopBack(storyId: string, storyTitle: string, fromStep: string, toStep: string, reason: string, loopCount: number, maxLoops: number) {
  try {
    await fetch(`${NODE_RED_URL}/deepterm/lifecycle-loop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'lifecycle-loop', storyId, storyTitle, fromStep, toStep, reason, loopCount, maxLoops }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('Node-RED lifecycle-loop webhook failed:', e);
  }
}

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
  test: 1200,  // 20 min — build + unit + UI tests on CI Mac
  review: null,
  deploy: 600,
  release: 120,
};


// Lifecycle template step definitions
const LIFECYCLE_TEMPLATES: Record<string, string[]> = {
  full:      ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'],
  quick_fix: ['triage', 'implement', 'test', 'review', 'deploy', 'release'],
  hotfix:    ['implement', 'test', 'deploy'],
  web_only:  ['triage', 'plan', 'implement', 'test', 'review', 'deploy'],
};

// Helper: record step duration for ETA estimates
async function recordStepDuration(storyId: string, stepId: string, durationSeconds: number) {
  try {
    await prisma.stepDurationHistory.create({
      data: { storyId, stepId, duration: durationSeconds },
    });
  } catch (e) {
    console.error('Failed to record step duration:', e);
  }
}

// Helper: get ETA estimates from historical durations
async function getStepETAs(): Promise<Record<string, { p50: number; p90: number; count: number }>> {
  const histories = await prisma.stepDurationHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const byStep: Record<string, number[]> = {};
  for (const h of histories) {
    if (!byStep[h.stepId]) byStep[h.stepId] = [];
    byStep[h.stepId].push(h.duration);
  }
  const etas: Record<string, { p50: number; p90: number; count: number }> = {};
  for (const [stepId, durations] of Object.entries(byStep)) {
    if (durations.length < 3) continue; // Need at least 3 data points
    const sorted = [...durations].sort((a, b) => a - b);
    etas[stepId] = {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      count: sorted.length,
    };
  }
  return etas;
}

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

    const stepETAs = await getStepETAs();

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
        scope: story.scope || 'app',
        lifecycleTemplate: story.lifecycleTemplate || 'full',
        lifecycleTemplateSteps: LIFECYCLE_TEMPLATES[story.lifecycleTemplate || 'full'] || LIFECYCLE_TEMPLATES.full,
        stepETAs,
        loopCount: story.loopCount || 0,
        maxLoops: story.maxLoops || 5,
        lastLoopFrom: story.lastLoopFrom || null,
        lastLoopTo: story.lastLoopTo || null,
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
        // Record step duration for ETA
        {
          const durStory = await prisma.story.findUnique({ where: { id: storyId }, select: { lifecycleStartedAt: true } });
          if (durStory?.lifecycleStartedAt) {
            const dur = Math.round((Date.now() - durStory.lifecycleStartedAt.getTime()) / 1000);
            await recordStepDuration(storyId, 'test', dur);
          }
        }
        updates.status = 'done';
        await logEvent(storyId, 'test', 'completed', 'Tests manually marked as passed', 'human');
        break;

      case 'mark-deployed':
        // Record step duration for ETA
        {
          const durStory = await prisma.story.findUnique({ where: { id: storyId }, select: { lifecycleStartedAt: true } });
          if (durStory?.lifecycleStartedAt) {
            const dur = Math.round((Date.now() - durStory.lifecycleStartedAt.getTime()) / 1000);
            await recordStepDuration(storyId, 'deploy', dur);
          }
        }
        updates.status = 'released';
        await logEvent(storyId, 'deploy', 'completed', 'Manually marked as deployed', 'human');
        break;

      case 'mark-released':
        // Record step duration for ETA
        {
          const durStory = await prisma.story.findUnique({ where: { id: storyId }, select: { lifecycleStartedAt: true } });
          if (durStory?.lifecycleStartedAt) {
            const dur = Math.round((Date.now() - durStory.lifecycleStartedAt.getTime()) / 1000);
            await recordStepDuration(storyId, 'release', dur);
          }
        }
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
        // Emit started event so UI clears old progress and shows fresh active state
        await logEvent(storyId, stepId, 'started', JSON.stringify({ message: `Step restarted (retry)` }), 'system');
        // Trigger CI workflow on the CI Mac when test step starts
        if (stepId === 'test') {
          const ciResult = await dispatchCIWorkflow(storyId);
          await logEvent(storyId, 'test', 'progress', JSON.stringify({
            message: ciResult.ok ? 'CI workflow dispatched on CI Mac (pr-check.yml)' : `CI dispatch failed: ${ciResult.error}`,
            ciDispatched: ciResult.ok,
          }), 'system');
        }
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
        // Trigger CI workflow when advancing to test step
        if (nextStep === 'test') {
          const ciResult = await dispatchCIWorkflow(storyId);
          await logEvent(storyId, 'test', 'progress', JSON.stringify({
            message: ciResult.ok ? 'CI workflow dispatched on CI Mac (pr-check.yml)' : `CI dispatch failed: ${ciResult.error}`,
            ciDispatched: ciResult.ok,
          }), 'system');
        }
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

      // ── Loop-back actions (Lifecycle V2) ──
      case 'loop-test-to-implement': {
        // Test failure → send back to implement for AI auto-fix
        const storyLoop1 = await prisma.story.findUnique({ where: { id: storyId }, select: { loopCount: true, maxLoops: true } });
        if (storyLoop1 && storyLoop1.loopCount >= storyLoop1.maxLoops) {
          return NextResponse.json({ error: `Circuit breaker: max loops (${storyLoop1.maxLoops}) reached. Human intervention required.` }, { status: 400 });
        }
        updates.lifecycleStep = 'implement';
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = new Date();
        updates.lastLoopFrom = 'test';
        updates.lastLoopTo = 'implement';
        updates.loopCount = (storyLoop1?.loopCount || 0) + 1;
        await logEvent(storyId, 'test', 'loop-back', JSON.stringify({ from: 'test', to: 'implement', reason: reason || 'Test failure — auto-fix' }), 'system');
        await logEvent(storyId, 'implement', 'started', JSON.stringify({ message: 'Restarted for auto-fix after test failure', context: reason }), 'system');

        // Comment on PR for traceability
        const prInfoTest = await findStoryPR(storyId, prisma);
        if (prInfoTest) {
          await commentOnPR(prInfoTest.repo, prInfoTest.prNumber,
            `## 🔄 Lifecycle Loop: Test → Implement\n\nTest failures detected. AI agent will attempt auto-fix (attempt ${(storyLoop1?.loopCount || 0) + 1}/${storyLoop1?.maxLoops || 5}).\n\nReason: ${reason || 'Test failure'}`
          );
        }

        // Notify Node-RED
        const storyTestLoop = await prisma.story.findUnique({ where: { id: storyId }, select: { title: true } });
        await notifyLoopBack(storyId, storyTestLoop?.title || '', 'test', 'implement', reason || 'Test failure — auto-fix', updates.loopCount as number, storyLoop1?.maxLoops || 5);
        break;
      }

      case 'loop-test-to-deliberation': {
        // Test failure -> re-architecture needed
        const storyLoopTD = await prisma.story.findUnique({ where: { id: storyId }, select: { loopCount: true, maxLoops: true, title: true } });
        if (storyLoopTD && storyLoopTD.loopCount >= storyLoopTD.maxLoops) {
          return NextResponse.json({ error: `Circuit breaker: max loops (${storyLoopTD.maxLoops}) reached.` }, { status: 400 });
        }
        await prisma.agentLoop.updateMany({
          where: { storyId, status: { in: ['queued', 'running'] } },
          data: { status: 'cancelled' },
        });
        const prInfoTD = await findStoryPR(storyId, prisma);
        if (prInfoTD) {
          await closePR(prInfoTD.repo, prInfoTD.prNumber);
          await commentOnPR(prInfoTD.repo, prInfoTD.prNumber,
            `## \u{1f504} Lifecycle Loop: Test \u2192 Deliberation\n\nTest failures indicate a fundamental approach problem.\nReason: ${reason || 'Test failure - re-architect'}`
          );
        }
        const newLoopCountTD = (storyLoopTD?.loopCount || 0) + 1;
        updates.lifecycleStep = 'deliberation';
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = null;
        updates.lastLoopFrom = 'test';
        updates.lastLoopTo = 'deliberation';
        updates.loopCount = newLoopCountTD;
        await logEvent(storyId, 'test', 'loop-back', JSON.stringify({ from: 'test', to: 'deliberation', reason: reason || 'Test failure - re-architect' }), 'system');
        await logEvent(storyId, 'deliberation', 'started', JSON.stringify({ message: 'Re-architecture after test failure', context: reason }), 'system');
        await notifyLoopBack(storyId, storyLoopTD?.title || '', 'test', 'deliberation', reason || 'Test failure - re-architect', newLoopCountTD, storyLoopTD?.maxLoops || 5);
        break;
      }

      case 'loop-review-to-implement': {
        // Review rejection → send back to implement with feedback
        if (!reason) return NextResponse.json({ error: 'Feedback text required for review → implement loop' }, { status: 400 });
        const storyLoop2 = await prisma.story.findUnique({ where: { id: storyId }, select: { loopCount: true, maxLoops: true } });
        if (storyLoop2 && storyLoop2.loopCount >= storyLoop2.maxLoops) {
          return NextResponse.json({ error: `Circuit breaker: max loops (${storyLoop2.maxLoops}) reached.` }, { status: 400 });
        }
        updates.lifecycleStep = 'implement';
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = new Date();
        updates.lastLoopFrom = 'review';
        updates.lastLoopTo = 'implement';
        updates.loopCount = (storyLoop2?.loopCount || 0) + 1;
        await logEvent(storyId, 'review', 'loop-back', JSON.stringify({ from: 'review', to: 'implement', reason, feedback: reason }), 'human');
        await logEvent(storyId, 'implement', 'started', JSON.stringify({ message: 'Restarted with review feedback', feedback: reason }), 'system');

        // Comment on PR for traceability
        const prInfoReview = await findStoryPR(storyId, prisma);
        if (prInfoReview) {
          await commentOnPR(prInfoReview.repo, prInfoReview.prNumber,
            `## 🔄 Lifecycle Loop: Review → Implement\n\nChanges requested. AI agent will revise code (attempt ${updates.loopCount}/${storyLoop2?.maxLoops || 5}).\n\nFeedback: ${reason}`
          );
        }

        // Notify Node-RED
        const storyRevLoop = await prisma.story.findUnique({ where: { id: storyId }, select: { title: true } });
        await notifyLoopBack(storyId, storyRevLoop?.title || '', 'review', 'implement', reason, updates.loopCount as number, storyLoop2?.maxLoops || 5);
        break;
      }

      case 'loop-review-to-deliberation': {
        // Review rejection → re-architect from deliberation
        if (!reason) return NextResponse.json({ error: 'Reason required for review → deliberation loop' }, { status: 400 });
        const storyLoop3 = await prisma.story.findUnique({ where: { id: storyId }, select: { loopCount: true, maxLoops: true, title: true } });
        if (storyLoop3 && storyLoop3.loopCount >= storyLoop3.maxLoops) {
          return NextResponse.json({ error: `Circuit breaker: max loops (${storyLoop3.maxLoops}) reached.` }, { status: 400 });
        }
        await prisma.agentLoop.updateMany({
          where: { storyId, status: { in: ['queued', 'running'] } },
          data: { status: 'cancelled' },
        });

        // Close PR via GitHub API (new deliberation = new implementation = new PR)
        const prInfoDelib = await findStoryPR(storyId, prisma);
        if (prInfoDelib) {
          await closePR(prInfoDelib.repo, prInfoDelib.prNumber);
          await commentOnPR(prInfoDelib.repo, prInfoDelib.prNumber,
            `## 🔄 Lifecycle Loop: Review → Deliberation\n\nThis implementation is being scrapped for re-architecture.\nReason: ${reason}\n\nA new deliberation will produce a fresh approach.`
          );
        }

        const newLoopCount3 = (storyLoop3?.loopCount || 0) + 1;
        updates.lifecycleStep = 'deliberation';
        updates.lifecycleStartedAt = new Date();
        updates.lifecycleHeartbeat = null;
        updates.lastLoopFrom = 'review';
        updates.lastLoopTo = 'deliberation';
        updates.loopCount = newLoopCount3;
        await logEvent(storyId, 'review', 'loop-back', JSON.stringify({ from: 'review', to: 'deliberation', reason }), 'human');
        await logEvent(storyId, 'deliberation', 'started', JSON.stringify({ message: 'Re-architecture requested from review', feedback: reason }), 'system');

        // Notify Node-RED
        await notifyLoopBack(storyId, storyLoop3?.title || '', 'review', 'deliberation', reason, newLoopCount3, storyLoop3?.maxLoops || 5);
        break;
      }

      case 'abandon-implementation': {
        // Close PR, delete branch, reset to planned
        updates.status = 'planned';
        updates.lifecycleStep = 'plan';
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        await prisma.agentLoop.updateMany({
          where: { storyId, status: { in: ['queued', 'running'] } },
          data: { status: 'cancelled' },
        });

        // Close PR and delete branch via GitHub API
        const prInfoAbandon = await findStoryPR(storyId, prisma);
        let ghResult = '';
        if (prInfoAbandon) {
          const closeRes = await closePR(prInfoAbandon.repo, prInfoAbandon.prNumber);
          ghResult += closeRes.closed ? 'PR closed. ' : `PR close failed: ${closeRes.message}. `;
          if (prInfoAbandon.branchName) {
            const delRes = await deleteBranch(prInfoAbandon.repo, prInfoAbandon.branchName);
            ghResult += delRes.deleted ? 'Branch deleted.' : `Branch delete: ${delRes.message}`;
          }
          // Comment on PR for traceability
          await commentOnPR(prInfoAbandon.repo, prInfoAbandon.prNumber,
            `## 🗄 Implementation Abandoned\n\nThis PR has been abandoned via the DeepTerm Lifecycle.\nReason: ${reason || 'No reason provided'}\n\nThe story has been moved back to Planning.`
          );
        }

        await logEvent(storyId, 'review', 'loop-back', JSON.stringify({ from: 'review', to: 'plan', reason: reason || 'Implementation abandoned', github: ghResult }), 'human');

        // Notify Node-RED
        const storyAbandon = await prisma.story.findUnique({ where: { id: storyId }, select: { title: true } });
        await notifyLoopBack(storyId, storyAbandon?.title || '', 'review', 'plan', reason || 'Implementation abandoned', 0, 5);
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
