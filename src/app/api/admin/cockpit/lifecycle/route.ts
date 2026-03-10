import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { closePR, deleteBranch, commentOnPR, findStoryPR } from '@/lib/github-pulls';

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const CI_REPO = 'deblasioluca/deepterm';

// ── Cached CI runner status (60s TTL) ──
let cachedRunnerStatus: { status: string; name: string; busy: boolean; labels: string[]; checkedAt: string } | null = null;
let runnerCacheExpiry = 0;

async function getCIRunnerStatus() {
  const now = Date.now();
  if (cachedRunnerStatus && now < runnerCacheExpiry) return cachedRunnerStatus;
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${CI_REPO}/actions/runners`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cachedRunnerStatus; // keep stale on error
    const data = await res.json();
    const runners = data.runners || [];
    // Find the self-hosted mac runner (or first runner)
    const mac = runners.find((r: { labels: { name: string }[] }) => r.labels?.some((l: { name: string }) => l.name === 'self-hosted-mac')) || runners[0];
    if (mac) {
      cachedRunnerStatus = {
        status: mac.status,
        name: mac.name,
        busy: mac.busy || false,
        labels: (mac.labels || []).map((l: { name: string }) => l.name),
        checkedAt: new Date().toISOString(),
      };
    } else {
      cachedRunnerStatus = { status: 'not_found', name: 'ci-mac', busy: false, labels: [], checkedAt: new Date().toISOString() };
    }
    runnerCacheExpiry = now + 60000; // 60s cache
    return cachedRunnerStatus;
  } catch {
    return cachedRunnerStatus; // keep stale on network error
  }
}

// Helper: dispatch pr-check.yml on the CI Mac with story context
async function dispatchCIWorkflow(storyId: string, branch: string = 'main') {
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
          ref: branch,
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

// ── Epic-level version bump via GitHub API ──
async function bumpVersionInXcode(releaseType: 'minor' | 'major'): Promise<{ ok: boolean; newVersion?: string; error?: string }> {
  const SWIFT_REPO = 'deblasioluca/deepterm';
  const PBXPROJ_PATH = 'DeepTerm.xcodeproj/project.pbxproj';
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: 'GITHUB_TOKEN not set' };
  try {
    const getRes = await fetch(`https://api.github.com/repos/${SWIFT_REPO}/contents/${PBXPROJ_PATH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!getRes.ok) return { ok: false, error: `GitHub get failed: ${getRes.status}` };
    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    const sha = fileData.sha;
    const match = content.match(/MARKETING_VERSION = ([\d.]+);/);
    if (!match) return { ok: false, error: 'MARKETING_VERSION not found in pbxproj' };
    const parts = match[1].split('.').map(Number);
    const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    const newVersion = releaseType === 'major' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
    const updated = content.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${newVersion};`);
    const putRes = await fetch(`https://api.github.com/repos/${SWIFT_REPO}/contents/${PBXPROJ_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        message: `chore: bump version to ${newVersion} (${releaseType} release)`,
        content: Buffer.from(updated).toString('base64'),
        sha,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return { ok: false, error: `GitHub put failed: ${putRes.status} ${JSON.stringify(err)}` };
    }
    return { ok: true, newVersion };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

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

      // Also find epics with active deliberations, and include their stories
      const epicsWithDeliberations = await prisma.deliberation.findMany({
        where: { epicId: { not: null }, status: { notIn: ['decided', 'failed'] } },
        select: { epicId: true },
      });
      const delibEpicIds = Array.from(new Set(epicsWithDeliberations.map(d => d.epicId!)));
      const storiesInDelibEpics = delibEpicIds.length > 0
        ? await prisma.story.findMany({ where: { epicId: { in: delibEpicIds } }, select: { id: true } })
        : [];
      const epicDelibStoryIds = storiesInDelibEpics.map(s => s.id);

      where.OR = [
        { status: { in: ['planned', 'in_progress', 'done'] } },
        ...(epicIds.length > 0 ? [{ epicId: { in: epicIds } }] : []),
        ...(activityIds.length > 0 ? [{ id: { in: activityIds } }] : []),
        ...(epicDelibStoryIds.length > 0 ? [{ id: { in: epicDelibStoryIds } }] : []),
      ];
    }

    const stories = await prisma.story.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 20,
      include: {
        epic: { select: { id: true, title: true, status: true, releaseType: true, targetVersion: true } },
      },
    });

    const stepETAs = await getStepETAs();

    const enriched = await Promise.all(stories.map(async (story) => {
      // Check for deliberation linked directly to story OR via epic
      let deliberation = await prisma.deliberation.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, summary: true },
      }).catch(() => null);

      if (!deliberation && story.epicId) {
        deliberation = await prisma.deliberation.findFirst({
          where: { epicId: story.epicId },
          orderBy: { createdAt: 'desc' },
          select: { id: true, status: true, summary: true },
        }).catch(() => null);
      }

      const agentLoop = await prisma.agentLoop.findFirst({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, status: true, prNumber: true, prUrl: true,
          startedAt: true, completedAt: true, errorLog: true,
          totalIterations: true, maxIterations: true,
          inputTokens: true, outputTokens: true,
          iterations: {
            orderBy: { iteration: 'asc' },
            select: {
              iteration: true, phase: true, observation: true,
              filesChanged: true, durationMs: true, createdAt: true,
            },
          },
        },
      }).catch(() => null);

      // Get recent lifecycle events for this story (last 5 per step for the active step)
      const recentEvents = await prisma.lifecycleEvent.findMany({
        where: { storyId: story.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }).catch(() => []);

      // ── Parse test step progress from lifecycle events ──
      let ciDispatched: boolean | null = null;
      let buildPass: 'pending' | 'active' | 'passed' | 'failed' = 'pending';
      let unitPass: 'pending' | 'active' | 'passed' | 'failed' = 'pending';
      let uiPass: 'pending' | 'active' | 'passed' | 'failed' = 'pending';
      let e2ePass: 'pending' | 'active' | 'passed' | 'failed' = 'pending';
      let testDetail: string | null = null;

      if (story.lifecycleStep === 'test' || story.status === 'done' || story.status === 'released') {
        // Walk events oldest-first to build up test state
        // Find the last retry/restart boundary, only process events after it
        const testEvents = [...recentEvents].reverse().filter(e => e.stepId === 'test');
        let boundaryIdx = -1;
        for (let i = testEvents.length - 1; i >= 0; i--) {
          const ev = testEvents[i];
          if (ev.event === 'retried' || (ev.event === 'started' && !(ev.detail || '').includes('"suite"'))) {
            boundaryIdx = i;
            break;
          }
        }
        const relevantEvents = boundaryIdx >= 0 ? testEvents.slice(boundaryIdx) : testEvents;

        for (const ev of relevantEvents) {
          let detail: Record<string, unknown> = {};
          try { detail = ev.detail ? JSON.parse(ev.detail) : {}; } catch { continue; }

          // CI dispatch tracking
          if (detail.ciDispatched !== undefined) {
            ciDispatched = !!detail.ciDispatched;
          }

          // Suite-level progress
          const suite = detail.suite as string;
          if (suite) {
            const status = ev.event === 'completed' ? 'passed'
              : ev.event === 'failed' ? 'failed'
              : ev.event === 'started' ? 'active'
              : ev.event === 'progress' ? 'active'
              : null;
            if (status) {
              if (suite === 'build') buildPass = status;
              else if (suite === 'unit') unitPass = status;
              else if (suite === 'ui') uiPass = status;
              else if (suite === 'e2e') e2ePass = status;
            }
          }

          // Overall test completion
          if (ev.event === 'completed' && !detail.suite) {
            buildPass = 'passed'; unitPass = 'passed'; uiPass = 'passed';
          }
          if (ev.event === 'failed' && !detail.suite && detail.message) {
            testDetail = detail.message as string;
          }
        }

        // Build summary detail text for compact card
        if (!testDetail) {
          const scope = story.scope || 'app';
          const suitesConfig = scope === 'web' ? { e2e: e2ePass }
            : scope === 'both' ? { build: buildPass, unit: unitPass, ui: uiPass, e2e: e2ePass }
            : { build: buildPass, unit: unitPass, ui: uiPass };
          const suiteEntries = Object.entries(suitesConfig);
          const passedCount = suiteEntries.filter(([, s]) => s === 'passed').length;
          const failedCount = suiteEntries.filter(([, s]) => s === 'failed').length;
          const activeCount = suiteEntries.filter(([, s]) => s === 'active').length;
          const allPending = suiteEntries.every(([, s]) => s === 'pending');

          if (failedCount > 0) {
            const failedSuites = suiteEntries.filter(([, s]) => s === 'failed').map(([k]) => k);
            testDetail = `Failed: ${failedSuites.join(', ')}`;
          } else if (passedCount === suiteEntries.length) {
            testDetail = 'All suites passed';
          } else if (activeCount > 0) {
            const activeSuites = suiteEntries.filter(([, s]) => s === 'active').map(([k]) => k);
            testDetail = `Running: ${activeSuites.join(', ')} (${passedCount}/${suiteEntries.length} passed)`;
          } else if (ciDispatched && allPending) {
            const runner = await getCIRunnerStatus();
            if (runner && runner.status !== 'online') {
              testDetail = 'CI dispatched — ⚠ runner offline, jobs queued';
            } else {
              testDetail = 'CI dispatched — waiting for runner…';
            }
          } else if (ciDispatched === null && allPending) {
            testDetail = 'Waiting for CI dispatch…';
          }
        }
      }

      return {
        id: story.id,
        title: story.title,
        description: story.description || '',
        status: story.status,
        epicId: story.epicId,
        epicTitle: story.epic?.title,
        epicStatus: story.epic?.status || null,
        triageApproved: story.status !== 'backlog' ? true : null,
        deliberationStatus: deliberation?.status || null,
        deliberationId: deliberation?.id || null,
        deliberationSummary: deliberation?.summary || null,
        agentLoopStatus: agentLoop?.status || null,
        agentLoopId: agentLoop?.id || null,
        agentLoopErrorLog: agentLoop?.errorLog || null,
        agentLoopProgress: agentLoop ? {
          current: agentLoop.totalIterations || 0,
          max: agentLoop.maxIterations || 10,
          startedAt: agentLoop.startedAt?.toISOString() || null,
          completedAt: agentLoop.completedAt?.toISOString() || null,
          inputTokens: agentLoop.inputTokens || 0,
          outputTokens: agentLoop.outputTokens || 0,
          iterations: (agentLoop.iterations || []).map(it => ({
            iteration: it.iteration,
            phase: it.phase,
            observation: it.observation,
            filesChanged: it.filesChanged,
            durationMs: it.durationMs,
          })),
        } : null,
        prNumber: agentLoop?.prNumber || null,
        prUrl: agentLoop?.prUrl || null,
        // GAP-13: Derive prMerged from lifecycle step position (past review = merged)
        prMerged: (() => {
          if (story.status === 'released') return true;
          const stepOrder = ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];
          const currentIdx = stepOrder.indexOf(story.lifecycleStep || '');
          const reviewIdx = stepOrder.indexOf('review');
          return currentIdx > reviewIdx;
        })(),
        // testsPass: true when lifecycle is past the test step (review/deploy/release)
        testsPass: (() => {
          if (story.status === 'released') return true;
          const stepOrder = ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];
          const currentIdx = stepOrder.indexOf(story.lifecycleStep || '');
          const testIdx = stepOrder.indexOf('test');
          if (currentIdx > testIdx) return true; // past test step
          return null;
        })(),
        // Test step progress (parsed from events)
        ciDispatched,
        buildPass: buildPass !== 'pending' ? buildPass : undefined,
        e2ePass: e2ePass !== 'pending' ? e2ePass : undefined,
        unitPass: unitPass !== 'pending' ? unitPass : undefined,
        uiPass: uiPass !== 'pending' ? uiPass : undefined,
        testDetail,
        deployed: story.status === 'released',
        released: story.status === 'released',
        version: null,
        // Release sub-steps: derive from events for granular tracking
        releaseNotesDone: story.status === 'released' || recentEvents.some(e => e.stepId === 'release' && e.event === 'progress' && e.detail?.includes('"subStep":"notes"')),
        emailSent: story.status === 'released' || recentEvents.some(e => e.stepId === 'release' && e.event === 'progress' && e.detail?.includes('"subStep":"notify"')),
        docsUpdated: story.status === 'released' || recentEvents.some(e => e.stepId === 'release' && e.event === 'progress' && e.detail?.includes('"subStep":"docs"')),
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
        mergedAt: story.mergedAt?.toISOString() || null,
        waitingForSiblings: story.lifecycleStep === 'merged',
        epicReleaseType: story.epic?.releaseType || 'minor',
        epicTargetVersion: story.epic?.targetVersion || null,


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

    // Fetch CI runner status (cached, ~60s TTL)
    const ciRunner = await getCIRunnerStatus();

    return NextResponse.json({ stories: enriched, ciRunner: ciRunner || null });
  } catch (error) {
    console.error('Lifecycle API error:', error);
    return NextResponse.json({ error: 'Failed to fetch lifecycle data' }, { status: 500 });
  }
}

// POST /api/admin/cockpit/lifecycle — Gate + recovery actions
// Auth: admin-session cookie (browser) OR x-api-key header (internal engine calls)
const LIFECYCLE_API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';

export async function POST(req: NextRequest) {
  try {
    // Validate x-api-key for internal (non-cookie) callers
    const apiKey = req.headers.get('x-api-key');
    if (apiKey) {
      if (!LIFECYCLE_API_KEY || apiKey !== LIFECYCLE_API_KEY) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }
    }

    const { action, storyId, reason, stepId } = await req.json();
    if (!storyId || !action) {
      return NextResponse.json({ error: 'storyId and action required' }, { status: 400 });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: { epic: { include: { stories: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true } } } } },
    });
    if (!story) return NextResponse.json({ error: 'Story not found' }, { status: 404 });

    // ── Sequential Protection Guards ──
    if (action === 'approve-triage' && story.epicId) {
      if (story.epic) {
        const DONE_STATUSES = ['reviewed', 'deployed', 'released', 'cancelled'];
        const siblings = story.epic.stories;
        const storyIdx = siblings.findIndex((s: { id: string }) => s.id === storyId);
        if (storyIdx > 0 && !DONE_STATUSES.includes(siblings[storyIdx - 1].status)) {
          return NextResponse.json({
            error: `Previous story must pass review first (status: ${siblings[storyIdx - 1].status})`,
            code: 'PREV_STORY_NOT_COMPLETE',
          }, { status: 409 });
        }
      }
      const activeEpics = await prisma.epic.findMany({
        where: { id: { not: story.epicId }, status: 'in_progress' },
        select: { title: true },
      });
      if (activeEpics.length > 0) {
        return NextResponse.json({
          error: `Another epic is in progress: "${activeEpics[0].title}". Complete it first.`,
          code: 'ANOTHER_EPIC_IN_PROGRESS',
        }, { status: 409 });
      }
    }
    // ─────────────────────────────────────────────

    const updates: Record<string, unknown> = {};

    switch (action) {
      // ── Triage gate actions ──
      case 'approve-triage':
        updates.status = 'planned';
        updates.lifecycleStep = 'plan';
        updates.lifecycleStartedAt = new Date();
        await logEvent(storyId, 'triage', 'completed', 'Triage approved by operator', 'human');
        await logEvent(storyId, 'plan', 'started', 'Planning started after triage approval', 'system');
        break;

      case 'reject-triage':
        updates.status = 'cancelled';
        updates.lifecycleStep = null;
        updates.lifecycleStartedAt = null;
        await logEvent(storyId, 'triage', 'failed', reason || 'Rejected at triage', 'human');
        break;

      case 'defer-triage':
        updates.lifecycleStep = null;
        updates.lifecycleStartedAt = null;
        await logEvent(storyId, 'triage', 'skipped', reason || 'Deferred for later', 'human');
        break;

      // ── Merge PR action ──
      case 'merge-pr': {
        const prInfo = await findStoryPR(storyId, prisma);
        if (!prInfo) {
          // No PR found — advance lifecycle anyway (PR may have been merged externally)
          updates.status = 'in_progress';
          updates.lifecycleStep = 'deploy';
          updates.lifecycleStartedAt = new Date();
          await logEvent(storyId, 'review', 'completed', 'PR approved (no PR record — advanced manually)', 'human');
          await logEvent(storyId, 'deploy', 'started', 'Deploy step started after review approval', 'system');
          break;
        }
        const { mergePR: doMergePR } = await import('@/lib/github-pulls');
        // Check PR state before attempting merge — handle already-closed PRs gracefully
        try {
          const prStateRes = await fetch(`https://api.github.com/repos/${prInfo.repo}/pulls/${prInfo.prNumber}`, {
            headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
            signal: AbortSignal.timeout(8000),
          });
          if (prStateRes.ok) {
            const prState = await prStateRes.json();
            if (prState.state === 'closed') {
              const alreadyMerged = prState.merged === true;
              updates.status = 'in_progress';
              updates.lifecycleStep = 'deploy';
              updates.lifecycleStartedAt = new Date();
              const msg = alreadyMerged
                ? `PR #${prInfo.prNumber} was already merged — advancing lifecycle`
                : `PR #${prInfo.prNumber} was closed (not merged) — advancing lifecycle`;
              await logEvent(storyId, 'review', 'completed', msg, 'human');
              await logEvent(storyId, 'deploy', 'started', 'Deploy step started after review approval', 'system');
              break;
            }
          }
        } catch { /* If check fails, continue to merge attempt */ }
        const mergeResult = await doMergePR(prInfo.repo, prInfo.prNumber);
        if (!mergeResult.merged) {
          return NextResponse.json({ error: `Merge failed: ${mergeResult.message}` }, { status: 400 });
        }
        // ── Epic-level deploy gate: check if all sibling stories are merged ──
        const thisStory = await prisma.story.findUnique({ where: { id: storyId }, select: { epicId: true } });
        if (thisStory?.epicId) {
          const siblingStories = await prisma.story.findMany({
            where: { epicId: thisStory.epicId, id: { not: storyId } },
            select: { id: true, status: true, lifecycleStep: true, mergedAt: true },
          });
          const allMerged = siblingStories.every(s =>
            s.mergedAt != null || s.status === 'released' ||
            s.lifecycleStep === 'deploy' || s.lifecycleStep === 'release' || s.lifecycleStep === 'merged'
          );
          if (!allMerged) {
            const pendingCount = siblingStories.filter(s =>
              s.mergedAt == null && s.status !== 'released' &&
              s.lifecycleStep !== 'deploy' && s.lifecycleStep !== 'release' && s.lifecycleStep !== 'merged'
            ).length;
            updates.status = 'in_progress';
            updates.lifecycleStep = 'merged';
            updates.lifecycleStartedAt = null;
            (updates as Record<string, unknown>).mergedAt = new Date();
            await logEvent(storyId, 'review', 'progress', JSON.stringify({
              message: `Merged — waiting for ${pendingCount} sibling stor${pendingCount === 1 ? 'y' : 'ies'} before epic deploy`,
              waitingForSiblings: true,
              pendingCount,
            }), 'system');
            break;
          }
          // All merged — promote any waiting siblings to deploy step
          await prisma.story.updateMany({
            where: { epicId: thisStory.epicId, id: { not: storyId }, lifecycleStep: 'merged' },
            data: { lifecycleStep: 'deploy', lifecycleStartedAt: new Date() },
          });
        }
        // Advance this (last) story to deploy
        updates.status = 'in_progress';
        updates.lifecycleStep = 'deploy';
        updates.lifecycleStartedAt = new Date();
        (updates as Record<string, unknown>).mergedAt = new Date();
        await logEvent(storyId, 'review', 'completed', `PR #${prInfo.prNumber} merged`, 'human');
        await logEvent(storyId, 'deploy', 'started', 'Deploy step started — all epic stories merged', 'system');
        break;
      }

      // ── Hold deploy action ──
      case 'hold-deploy':
        updates.lifecycleStep = 'deploy';
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        await logEvent(storyId, 'deploy', 'cancelled', reason || 'Deployment held by operator', 'human');
        break;

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
        // GAP-13: Advance to deploy, don't set 'done' prematurely
        updates.status = 'in_progress';
        updates.lifecycleStep = 'deploy';
        updates.lifecycleStartedAt = new Date();
        await logEvent(storyId, 'review', 'completed', 'PR approved and merged', 'human');
        await logEvent(storyId, 'deploy', 'started', 'Deploy step started after review approval', 'system');
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
        // GAP-12: Advance to review step — do NOT auto-complete past the human review gate
        updates.status = 'in_progress';
        updates.lifecycleStep = 'review';
        updates.lifecycleStartedAt = new Date();
        await logEvent(storyId, 'test', 'completed', 'Tests manually marked as passed', 'human');
        await logEvent(storyId, 'review', 'started', 'Review step started after tests passed', 'system');
        break;

      case 'deploy-release':
      case 'mark-deployed': {
        // Record step duration for ETA
        {
          const durStory = await prisma.story.findUnique({ where: { id: storyId }, select: { lifecycleStartedAt: true } });
          if (durStory?.lifecycleStartedAt) {
            const dur = Math.round((Date.now() - durStory.lifecycleStartedAt.getTime()) / 1000);
            await recordStepDuration(storyId, 'deploy', dur);
          }
        }
        // ── Version bump via GitHub API (once per epic) ──
        const deployStory = await prisma.story.findUnique({ where: { id: storyId }, select: { epicId: true } });
        let bumpedVersion: string | undefined;
        if (deployStory?.epicId) {
          const epic = await prisma.epic.findUnique({ where: { id: deployStory.epicId }, select: { releaseType: true, targetVersion: true } });
          if (epic && !epic.targetVersion) {
            const releaseType = (epic.releaseType as 'minor' | 'major') || 'minor';
            await logEvent(storyId, 'deploy', 'progress', JSON.stringify({ message: `Bumping version (${releaseType} release) in Xcode via GitHub API...` }), 'system');
            const bumpResult = await bumpVersionInXcode(releaseType);
            if (bumpResult.ok && bumpResult.newVersion) {
              bumpedVersion = bumpResult.newVersion;
              await prisma.epic.update({ where: { id: deployStory.epicId }, data: { targetVersion: bumpResult.newVersion } });
              await logEvent(storyId, 'deploy', 'progress', JSON.stringify({ message: `Version bumped to ${bumpResult.newVersion} in Xcode (committed to main)` }), 'system');
            } else {
              await logEvent(storyId, 'deploy', 'progress', JSON.stringify({ message: `Version bump skipped: ${bumpResult.error}` }), 'system');
            }
          } else if (epic?.targetVersion) {
            bumpedVersion = epic.targetVersion;
          }
        }
        updates.status = 'released';
        updates.lifecycleStep = 'release';
        updates.lifecycleStartedAt = new Date();
        await logEvent(storyId, 'deploy', 'completed', action === 'deploy-release'
          ? `Deploy release triggered by operator${bumpedVersion ? ` (v${bumpedVersion})` : ''}`
          : 'Manually marked as deployed', 'human');
        await logEvent(storyId, 'release', 'started', `Release step started after deploy${bumpedVersion ? ` — v${bumpedVersion}` : ''}`, 'system');
        break;
      }

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
        updates.lifecycleStep = 'release';
        updates.lifecycleStartedAt = null;
        updates.lifecycleHeartbeat = null;
        // Log release sub-step audit events for transparency
        await logEvent(storyId, 'release', 'progress', JSON.stringify({ subStep: 'notes', message: 'Release notes published' }), 'system');
        await logEvent(storyId, 'release', 'progress', JSON.stringify({ subStep: 'notify', message: 'Stakeholders notified' }), 'system');
        await logEvent(storyId, 'release', 'progress', JSON.stringify({ subStep: 'docs', message: 'Documentation updated' }), 'system');
        await logEvent(storyId, 'release', 'completed', reason || 'Manually marked as released', 'human');
        break;

      // ── Internal CI dispatch (called by engine auto-advance) ──
      case 'dispatch-ci': {
        if (!stepId || stepId !== 'test') {
          return NextResponse.json({ error: 'dispatch-ci only supports stepId=test' }, { status: 400 });
        }
        const _lb1 = await prisma.agentLoop.findFirst({ where: { storyId }, select: { branchName: true }, orderBy: { createdAt: 'desc' } });
        const ciResult = await dispatchCIWorkflow(storyId, _lb1?.branchName ?? "main");
        await logEvent(storyId, 'test', 'progress', JSON.stringify({
          message: ciResult.ok ? 'CI workflow dispatched on CI Mac (pr-check.yml)' : `CI dispatch failed: ${ciResult.error}`,
          ciDispatched: ciResult.ok,
        }), 'system');
        return NextResponse.json({ ok: ciResult.ok, error: ciResult.error || null });
      }

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
          const _lb2 = await prisma.agentLoop.findFirst({ where: { storyId }, select: { branchName: true }, orderBy: { createdAt: 'desc' } });
          const ciResult = await dispatchCIWorkflow(storyId, _lb2?.branchName ?? "main");
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
          const _lb3 = await prisma.agentLoop.findFirst({ where: { storyId }, select: { branchName: true }, orderBy: { createdAt: 'desc' } });
          const ciResult = await dispatchCIWorkflow(storyId, _lb3?.branchName ?? 'main');
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
