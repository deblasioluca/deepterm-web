import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPOS: Record<string, string> = {
  'deepterm-web': 'deblasioluca/deepterm-web',
  'deepterm': 'deblasioluca/deepterm',
};

const STUCK_THRESHOLD_MS = 45 * 60 * 1000; // 45 minutes

interface GHRun {
  id: number;
  name: string;
  display_title: string;
  status: string;
  conclusion: string | null;
  workflow_id: number;
  workflow_path: string;
  head_branch: string;
  run_number: number;
  created_at: string;
  updated_at: string;
  run_started_at: string | null;
  html_url: string;
  event: string;
  repository: { name: string; full_name: string };
}

async function fetchRepoRuns(fullRepo: string, repoKey: string): Promise<GHRun[]> {
  if (!GITHUB_TOKEN) return [];

  // Fetch runs created in the last 24 hours
  const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const url = `https://api.github.com/repos/${fullRepo}/actions/runs?per_page=100&created=>=${since}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`GitHub runs fetch failed for ${fullRepo}: ${res.status} ${text}`);
    return [];
  }

  const data = await res.json() as { workflow_runs: GHRun[] };
  return (data.workflow_runs || []).map(r => ({ ...r, repository: { name: repoKey, full_name: fullRepo } }));
}

export async function GET() {
  try {
    if (!GITHUB_TOKEN) {
      return NextResponse.json({
        configured: false,
        runs: [],
        error: 'GITHUB_TOKEN not configured',
      });
    }

    const allRunArrays = await Promise.all(
      Object.entries(REPOS).map(([key, full]) => fetchRepoRuns(full, key))
    );
    const allRuns = allRunArrays.flat();

    const now = Date.now();
    const runs = allRuns
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .map(r => {
        const startedAt = r.run_started_at || r.created_at;
        const endedAt = (r.status === 'completed') ? r.updated_at : null;
        const startMs = new Date(startedAt).getTime();
        const endMs = endedAt ? new Date(endedAt).getTime() : null;
        const durationMs = endMs ? endMs - startMs : (r.status !== 'completed' ? now - startMs : null);
        const isStuck =
          r.status === 'in_progress' &&
          durationMs !== null &&
          durationMs > STUCK_THRESHOLD_MS;

        return {
          id: r.id,
          repo: r.repository.name,
          name: r.name || r.display_title,
          workflow: r.workflow_path?.split('/').pop()?.replace(/\.yml$/, '') || r.name,
          branch: r.head_branch,
          runNumber: r.run_number,
          event: r.event,
          status: r.status,          // queued | in_progress | completed
          conclusion: r.conclusion,  // success | failure | cancelled | skipped | null
          createdAt: r.created_at,
          startedAt,
          endedAt,
          durationMs,
          isStuck,
          url: r.html_url,
        };
      });

    return NextResponse.json({ configured: true, runs });
  } catch (error) {
    console.error('CI Mac tab error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch CI runs';
    return NextResponse.json({ configured: false, runs: [], error: msg }, { status: 500 });
  }
}

// POST: cancel or rerun a workflow run
export async function POST(req: NextRequest) {
  try {
    const { runId, repo, action } = await req.json() as { runId: number; repo: string; action: 'rerun' | 'cancel' };
    if (!runId || !repo || !action) {
      return NextResponse.json({ error: 'runId, repo, action required' }, { status: 400 });
    }
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
    }

    const fullRepo = REPOS[repo] || repo;
    const endpoint = action === 'rerun'
      ? `https://api.github.com/repos/${fullRepo}/actions/runs/${runId}/rerun`
      : `https://api.github.com/repos/${fullRepo}/actions/runs/${runId}/cancel`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (res.status === 201 || res.status === 202 || res.status === 204) {
      return NextResponse.json({ ok: true, message: `Run ${action === 'rerun' ? 're-triggered' : 'cancelled'} successfully` });
    }

    const body = await res.text().catch(() => '');
    return NextResponse.json({ error: `GitHub returned ${res.status}: ${body}` }, { status: res.status });
  } catch (error) {
    console.error('CI Mac action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
