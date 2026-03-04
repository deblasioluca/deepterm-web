import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { airflowJSON, getAirflowConfig } from '@/lib/airflow';

export const dynamic = 'force-dynamic';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPOS: Record<string, string> = {
  'deepterm-web': 'deblasioluca/deepterm-web',
  deepterm: 'deblasioluca/deepterm',
};
const STUCK_CI_MS = 45 * 60 * 1000;
const STUCK_LOOP_MS = 60 * 60 * 1000;
const STUCK_STEP_MS = 40 * 60 * 1000;

// ─── types used in the response ───────────────────────────────────────────────

export interface ObsPhase {
  id: string;
  lane: 'pi' | 'ai-dev-mac' | 'ci-mac';
  stepId: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: 'running' | 'success' | 'failed' | 'queued' | 'stuck' | 'skipped';
  loopIteration?: number;
  githubRunId?: number;
  githubUrl?: string;
  airflowRunId?: string;
  agentLoopId?: string;
}

export interface ObsStory {
  id: string;
  title: string;
  status: string;
  colorIndex: number;
  phases: ObsPhase[];
}

export interface UnlinkedRun {
  id: string;
  lane: 'ai-dev-mac' | 'ci-mac';
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: string;
  isStuck: boolean;
  url?: string;
}

// ─── GitHub helpers ────────────────────────────────────────────────────────────

async function fetchGitHubRuns(sinceIso: string): Promise<GHRun[]> {
  if (!GITHUB_TOKEN) return [];
  const all: GHRun[] = [];
  await Promise.all(
    Object.entries(REPOS).map(async ([key, full]) => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${full}/actions/runs?per_page=100&created=>=${sinceIso}`,
          {
            headers: {
              Authorization: `Bearer ${GITHUB_TOKEN}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (!res.ok) return;
        const data = await res.json() as { workflow_runs: GHRun[] };
        for (const r of data.workflow_runs || []) {
          all.push({ ...r, _repoKey: key });
        }
      } catch { /* ignore */ }
    })
  );
  return all;
}

interface GHRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  workflow_path: string;
  head_branch: string;
  run_number: number;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  html_url: string;
  _repoKey: string;
}

// ─── Airflow helpers ───────────────────────────────────────────────────────────

interface AirflowRun {
  dag_id: string;
  dag_run_id: string;
  state: string;
  start_date: string | null;
  end_date: string | null;
  conf: Record<string, unknown>;
}

async function fetchAirflowRuns(sinceIso: string): Promise<AirflowRun[]> {
  try {
    const cfg = await getAirflowConfig();
    if (!cfg) return [];
    const data = await airflowJSON<{ dag_runs: AirflowRun[] }>(
      `/dags/~/dagRuns?limit=200&order_by=-start_date&start_date_gte=${encodeURIComponent(sinceIso)}`
    );
    return data.dag_runs || [];
  } catch { return []; }
}

// ─── Pi phase reconstruction ───────────────────────────────────────────────────

function buildPiPhases(
  events: { id: string; stepId: string; event: string; createdAt: Date }[],
  story: { lifecycleStep: string | null; lifecycleStartedAt: Date | null },
  now: number,
  windowStart: number
): ObsPhase[] {
  const byStep = new Map<string, { startedAt: Date | null; endedAt: Date | null; status: ObsPhase['status'] }>();

  for (const e of events) {
    const s = e.stepId;
    if (!byStep.has(s)) byStep.set(s, { startedAt: null, endedAt: null, status: 'running' });
    const entry = byStep.get(s)!;

    if (e.event === 'started') {
      if (!entry.startedAt || e.createdAt < entry.startedAt) entry.startedAt = e.createdAt;
      entry.status = 'running';
    } else if (e.event === 'completed') {
      entry.endedAt = e.createdAt;
      entry.status = 'success';
    } else if (e.event === 'skipped') {
      if (!entry.startedAt) entry.startedAt = e.createdAt;
      entry.endedAt = e.createdAt;
      entry.status = 'skipped';
    } else if (e.event === 'failed' || e.event === 'timeout') {
      entry.endedAt = e.createdAt;
      entry.status = 'failed';
    }
  }

  // If there's a currently active step with no corresponding event in window,
  // still show it using lifecycleStartedAt (may predate the window)
  if (story.lifecycleStep && !byStep.has(story.lifecycleStep)) {
    const startMs = story.lifecycleStartedAt?.getTime() ?? now;
    byStep.set(story.lifecycleStep, {
      startedAt: new Date(startMs),
      endedAt: null,
      status: 'running',
    });
  }

  const phases: ObsPhase[] = [];
  for (const [stepId, entry] of Array.from(byStep.entries())) {
    if (!entry.startedAt) continue;
    const startMs = Math.max(entry.startedAt.getTime(), windowStart);
    const endMs = entry.endedAt ? entry.endedAt.getTime() : null;
    const durationMs = endMs ? endMs - entry.startedAt.getTime() : (entry.status === 'running' ? now - entry.startedAt.getTime() : null);
    const isStuck = entry.status === 'running' && durationMs !== null && durationMs > STUCK_STEP_MS;

    phases.push({
      id: `pi-${stepId}-${entry.startedAt.getTime()}`,
      lane: 'pi',
      stepId,
      label: stepId.charAt(0).toUpperCase() + stepId.slice(1),
      startedAt: new Date(startMs).toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
      durationMs,
      status: isStuck ? 'stuck' : entry.status,
    });
  }
  return phases;
}

// ─── main GET handler ──────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const windowHours = Math.min(parseInt(searchParams.get('window') || '24', 10), 168);
  const now = Date.now();
  const windowStart = now - windowHours * 60 * 60 * 1000;
  const since = new Date(windowStart);
  const sinceIso = since.toISOString();

  try {
    // ── 1. DB: stories with any lifecycle activity in window ─────────────────
    const [dbEvents, dbStories, dbLoops] = await Promise.all([
      prisma.lifecycleEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, storyId: true, stepId: true, event: true, createdAt: true },
      }),
      prisma.story.findMany({
        where: {
          OR: [
            { status: 'in_progress' },
            { lifecycleEvents: { some: { createdAt: { gte: since } } } },
          ],
        },
        select: {
          id: true, title: true, status: true,
          lifecycleStep: true, lifecycleStartedAt: true,
          agentLoops: {
            where: { createdAt: { gte: since } },
            select: { id: true, storyId: true, branchName: true, status: true, startedAt: true, completedAt: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      prisma.agentLoop.findMany({
        where: { createdAt: { gte: since }, storyId: { not: null } },
        select: { id: true, storyId: true, branchName: true, status: true, startedAt: true, completedAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // ── 2. External: GitHub + Airflow (parallel, errors silenced) ────────────
    const [ghRuns, airflowRuns] = await Promise.all([
      fetchGitHubRuns(sinceIso),
      fetchAirflowRuns(sinceIso),
    ]);

    // ── 3. Build branch → storyId index ─────────────────────────────────────
    const branchToStoryId = new Map<string, string>();
    for (const loop of dbLoops) {
      if (loop.storyId && loop.branchName) branchToStoryId.set(loop.branchName, loop.storyId);
    }
    for (const story of dbStories) {
      for (const loop of story.agentLoops) {
        if (loop.branchName) branchToStoryId.set(loop.branchName, story.id);
      }
    }

    // ── 4. Build Airflow conf.storyId → runId index ──────────────────────────
    const airflowByStoryId = new Map<string, AirflowRun[]>();
    const airflowUnlinked: AirflowRun[] = [];
    for (const r of airflowRuns) {
      const sid = r.conf?.storyId as string | undefined;
      if (sid) {
        if (!airflowByStoryId.has(sid)) airflowByStoryId.set(sid, []);
        airflowByStoryId.get(sid)!.push(r);
      } else {
        airflowUnlinked.push(r);
      }
    }

    // ── 5. Build GitHub run → storyId index ─────────────────────────────────
    const ghByStoryId = new Map<string, GHRun[]>();
    const ghUnlinked: GHRun[] = [];
    for (const r of ghRuns) {
      const sid = branchToStoryId.get(r.head_branch);
      if (sid) {
        if (!ghByStoryId.has(sid)) ghByStoryId.set(sid, []);
        ghByStoryId.get(sid)!.push(r);
      } else {
        ghUnlinked.push(r);
      }
    }

    // ── 6. Assemble story phases ─────────────────────────────────────────────
    const storyMap = new Map(dbStories.map(s => [s.id, s]));
    const eventsByStory = new Map<string, typeof dbEvents>();
    for (const e of dbEvents) {
      if (!eventsByStory.has(e.storyId)) eventsByStory.set(e.storyId, []);
      eventsByStory.get(e.storyId)!.push(e);
    }

    let colorIndex = 0;
    const obsStories: ObsStory[] = [];

    for (const story of dbStories) {
      const phases: ObsPhase[] = [];

      // Pi lane — lifecycle event phases
      phases.push(...buildPiPhases(
        eventsByStory.get(story.id) ?? [],
        { lifecycleStep: story.lifecycleStep, lifecycleStartedAt: story.lifecycleStartedAt },
        now, windowStart
      ));

      // AI Dev Mac lane — agent loops
      for (const loop of story.agentLoops) {
        const startMs = loop.startedAt ? Math.max(loop.startedAt.getTime(), windowStart) : null;
        if (!startMs) continue;
        const endMs = loop.completedAt ? loop.completedAt.getTime() : null;
        const durationMs = endMs ? loop.completedAt!.getTime() - loop.startedAt!.getTime() : (loop.status === 'running' ? now - loop.startedAt!.getTime() : null);
        const isStuck = loop.status === 'running' && durationMs !== null && durationMs > STUCK_LOOP_MS;
        const status: ObsPhase['status'] = isStuck ? 'stuck'
          : loop.status === 'completed' ? 'success'
          : loop.status === 'failed' ? 'failed'
          : loop.status === 'running' ? 'running'
          : 'queued';

        phases.push({
          id: `ai-${loop.id}`,
          lane: 'ai-dev-mac',
          stepId: 'implement',
          label: 'Agent Loop',
          startedAt: new Date(startMs).toISOString(),
          endedAt: loop.completedAt?.toISOString() ?? null,
          durationMs,
          status,
          agentLoopId: loop.id,
        });
      }

      // AI Dev Mac lane — Airflow runs linked by storyId
      for (const r of airflowByStoryId.get(story.id) ?? []) {
        const startMs = r.start_date ? Math.max(new Date(r.start_date).getTime(), windowStart) : null;
        if (!startMs) continue;
        const endMs = r.end_date ? new Date(r.end_date).getTime() : null;
        const rawStart = r.start_date ? new Date(r.start_date).getTime() : now;
        const durationMs = endMs ? endMs - rawStart : (r.state === 'running' ? now - rawStart : null);
        const isStuck = r.state === 'running' && durationMs !== null && durationMs > STUCK_LOOP_MS;
        const dagLabel = r.dag_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const status: ObsPhase['status'] = isStuck ? 'stuck'
          : r.state === 'success' ? 'success'
          : r.state === 'failed' ? 'failed'
          : r.state === 'running' ? 'running'
          : 'queued';

        phases.push({
          id: `af-${r.dag_run_id}`,
          lane: 'ai-dev-mac',
          stepId: r.dag_id,
          label: dagLabel,
          startedAt: new Date(startMs).toISOString(),
          endedAt: r.end_date ?? null,
          durationMs,
          status,
          airflowRunId: r.dag_run_id,
        });
      }

      // CI Mac lane — GitHub runs matched via branch name
      for (const r of ghByStoryId.get(story.id) ?? []) {
        const startedAt = r.run_started_at || r.created_at;
        const startMs = Math.max(new Date(startedAt).getTime(), windowStart);
        const endMs = r.status === 'completed' ? new Date(r.updated_at).getTime() : null;
        const rawStart = new Date(startedAt).getTime();
        const durationMs = endMs ? endMs - rawStart : (r.status === 'in_progress' ? now - rawStart : null);
        const isStuck = r.status === 'in_progress' && durationMs !== null && durationMs > STUCK_CI_MS;
        const workflowLabel = (r.workflow_path?.split('/').pop()?.replace(/\.yml$/, '') || r.name || 'CI');
        const status: ObsPhase['status'] = isStuck ? 'stuck'
          : r.conclusion === 'success' ? 'success'
          : r.conclusion === 'failure' ? 'failed'
          : r.status === 'in_progress' ? 'running'
          : r.status === 'queued' ? 'queued'
          : r.conclusion === 'cancelled' ? 'skipped'
          : 'running';

        phases.push({
          id: `gh-${r.id}`,
          lane: 'ci-mac',
          stepId: workflowLabel,
          label: workflowLabel,
          startedAt: new Date(startMs).toISOString(),
          endedAt: endMs ? new Date(endMs).toISOString() : null,
          durationMs,
          status,
          githubRunId: r.id,
          githubUrl: r.html_url,
        });
      }

      if (phases.length === 0) continue;

      obsStories.push({
        id: story.id,
        title: story.title,
        status: story.status,
        colorIndex: colorIndex++ % 8,
        phases,
      });
    }

    // Sort stories: active first, then by first phase time desc
    obsStories.sort((a, b) => {
      const aActive = a.phases.some(p => p.status === 'running' || p.status === 'stuck');
      const bActive = b.phases.some(p => p.status === 'running' || p.status === 'stuck');
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aFirst = Math.max(...a.phases.map(p => new Date(p.startedAt).getTime()));
      const bFirst = Math.max(...b.phases.map(p => new Date(p.startedAt).getTime()));
      return bFirst - aFirst;
    });

    // ── 7. Unlinked runs ────────────────────────────────────────────────────
    const unlinked: UnlinkedRun[] = [];

    for (const r of airflowUnlinked) {
      if (!r.start_date) continue;
      const startMs = new Date(r.start_date).getTime();
      const endMs = r.end_date ? new Date(r.end_date).getTime() : null;
      const durationMs = endMs ? endMs - startMs : (r.state === 'running' ? now - startMs : null);
      unlinked.push({
        id: r.dag_run_id,
        lane: 'ai-dev-mac',
        label: r.dag_id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        startedAt: r.start_date,
        endedAt: r.end_date ?? null,
        durationMs,
        status: r.state,
        isStuck: r.state === 'running' && durationMs !== null && durationMs > STUCK_LOOP_MS,
      });
    }

    for (const r of ghUnlinked) {
      const startedAt = r.run_started_at || r.created_at;
      const startMs = new Date(startedAt).getTime();
      const endMs = r.status === 'completed' ? new Date(r.updated_at).getTime() : null;
      const durationMs = endMs ? endMs - startMs : (r.status === 'in_progress' ? now - startMs : null);
      unlinked.push({
        id: String(r.id),
        lane: 'ci-mac',
        label: r.workflow_path?.split('/').pop()?.replace(/\.yml$/, '') || r.name,
        startedAt,
        endedAt: endMs ? new Date(endMs).toISOString() : null,
        durationMs,
        status: r.status === 'completed' ? (r.conclusion || 'done') : r.status,
        isStuck: r.status === 'in_progress' && durationMs !== null && durationMs > STUCK_CI_MS,
        url: r.html_url,
      });
    }

    // Sort unlinked by startedAt desc
    unlinked.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return NextResponse.json({
      window: windowHours,
      windowStart: sinceIso,
      nowMs: now,
      stories: obsStories,
      unlinked,
      configured: {
        github: !!GITHUB_TOKEN,
        airflow: !!(await getAirflowConfig().catch(() => null)),
      },
    });
  } catch (err) {
    console.error('Observability tab error:', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
