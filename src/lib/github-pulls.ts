/**
 * GitHub helper — PRs, branches, commits, workflow runs.
 * Provides functions to list PRs, get diffs, merge, request changes,
 * manage branches, view commits, and interact with GitHub Actions.
 */

export const REPOS = ['deblasioluca/deepterm'];

function getGitHubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  repo: string;
  user: string;
  branch: string;
  baseBranch: string;
  labels: Array<{ name: string; color: string }>;
  reviewDecision: string | null;
  mergeable: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  url: string;
  diffUrl: string;
}

export interface PRFile {
  filename: string;
  status: string; // added, modified, removed, renamed
  additions: number;
  deletions: number;
  patch: string;
}

export interface PRReview {
  id: number;
  user: string;
  state: string; // APPROVED, CHANGES_REQUESTED, COMMENTED
  body: string;
  submittedAt: string;
}

/**
 * List open PRs across all repos.
 */
export async function listOpenPRs(): Promise<PullRequest[]> {
  const headers = getGitHubHeaders();
  const allPRs: PullRequest[] = [];

  for (const repo of REPOS) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=30`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const prs = await res.json();

      for (const pr of prs) {
        allPRs.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          state: pr.state,
          draft: pr.draft || false,
          repo,
          user: pr.user?.login || 'unknown',
          branch: pr.head?.ref || '',
          baseBranch: pr.base?.ref || '',
          labels: (pr.labels || []).map((l: any) => ({ name: l.name, color: l.color })),
          reviewDecision: null,
          mergeable: pr.mergeable ?? true,
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          changedFiles: pr.changed_files || 0,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          url: pr.html_url,
          diffUrl: pr.diff_url,
        });
      }
    } catch {
      // Skip repo on error
    }
  }

  return allPRs.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}


/**
 * Get files changed in a PR.
 */
export async function getPRFiles(repo: string, prNumber: number): Promise<PRFile[]> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/files?per_page=100`,
    { headers, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const files = await res.json();

  return files.map((f: any) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch || '',
  }));
}

/**
 * Get reviews on a PR.
 */
export async function getPRReviews(repo: string, prNumber: number): Promise<PRReview[]> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const reviews = await res.json();

  return reviews.map((r: any) => ({
    id: r.id,
    user: r.user?.login || 'unknown',
    state: r.state,
    body: r.body || '',
    submittedAt: r.submitted_at,
  }));
}

/**
 * Merge a PR.
 */
export async function mergePR(
  repo: string,
  prNumber: number,
  method: 'merge' | 'squash' | 'rebase' = 'squash',
  commitTitle?: string
): Promise<{ merged: boolean; message: string; sha?: string }> {
  const headers = getGitHubHeaders();
  const body: Record<string, unknown> = { merge_method: method };
  if (commitTitle) body.commit_title = commitTitle;

  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/merge`,
    {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    }
  );

  const data = await res.json();
  if (res.ok) {
    return { merged: true, message: data.message || 'PR merged', sha: data.sha };
  }
  return { merged: false, message: data.message || `Merge failed (${res.status})` };
}

/**
 * Submit a review (approve or request changes).
 */
export async function submitReview(
  repo: string,
  prNumber: number,
  event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  body?: string
): Promise<{ id: number; state: string }> {
  const headers = getGitHubHeaders();

  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}/reviews`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event,
        body: body || (event === 'APPROVE' ? 'Approved via DeepTerm Cockpit' : ''),
      }),
      signal: AbortSignal.timeout(10000),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Review submission failed: ${err}`);
  }

  const data = await res.json();
  return { id: data.id, state: data.state };
}

/**
 * Close a PR without merging.
 */
export async function closePR(
  repo: string,
  prNumber: number
): Promise<{ closed: boolean; message: string }> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls/${prNumber}`,
    {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed" }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (res.ok) return { closed: true, message: "PR closed" };
  const data = await res.json().catch(() => ({}));
  return { closed: false, message: data.message || `Close failed (${res.status})` };
}

/**
 * Delete a branch from a repo.
 */
export async function deleteBranch(
  repo: string,
  branchName: string
): Promise<{ deleted: boolean; message: string }> {
  const headers = getGitHubHeaders();
  const ref = `heads/${branchName}`;
  const res = await fetch(
    `https://api.github.com/repos/${repo}/git/refs/${ref}`,
    {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(10000),
    }
  );
  if (res.status === 204 || res.ok) return { deleted: true, message: "Branch deleted" };
  if (res.status === 422) return { deleted: false, message: "Branch not found or already deleted" };
  return { deleted: false, message: `Delete failed (${res.status})` };
}

/**
 * Post a comment on a PR (used for loop-back notifications).
 */
export async function commentOnPR(
  repo: string,
  prNumber: number,
  body: string
): Promise<{ id: number | null; success: boolean }> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(10000),
    }
  );
  if (res.ok) {
    const data = await res.json();
    return { id: data.id, success: true };
  }
  return { id: null, success: false };
}

/**
 * Find PR info for a story by looking at its most recent AgentLoop.
 */
export async function findStoryPR(storyId: string, prisma: any): Promise<{
  repo: string;
  prNumber: number;
  branchName: string;
  prUrl: string;
} | null> {
  const agentLoop = await prisma.agentLoop.findFirst({
    where: { storyId, prNumber: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { prNumber: true, prUrl: true, branchName: true },
  });
  if (!agentLoop?.prNumber) return null;

  // Determine repo from prUrl (e.g., https://github.com/deblasioluca/deepterm-web/pull/42)
  let repo = "deblasioluca/deepterm-web"; // default
  if (agentLoop.prUrl) {
    const match = agentLoop.prUrl.match(/github\.com\/([^/]+\/[^/]+)\/pull/);
    if (match) repo = match[1];
  }

  return {
    repo,
    prNumber: agentLoop.prNumber,
    branchName: agentLoop.branchName || "",
    prUrl: agentLoop.prUrl || "",
  };
}

// ── Branches ──────────────────────────────────────────────────────────────────

export interface Branch {
  name: string;
  sha: string;
  repo: string;
  protected: boolean;
  behindAhead?: { behind: number; ahead: number };
}

/**
 * List branches across all repos.
 */
export async function listBranches(repo?: string): Promise<Branch[]> {
  const headers = getGitHubHeaders();
  const repos = repo ? [repo] : REPOS;
  const all: Branch[] = [];

  for (const r of repos) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${r}/branches?per_page=100`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const branches = await res.json();
      for (const b of branches) {
        all.push({
          name: b.name,
          sha: b.commit?.sha || '',
          repo: r,
          protected: b.protected || false,
        });
      }
    } catch { /* skip */ }
  }

  return all;
}

/**
 * Compare two branches (base...head). Returns ahead/behind counts and commits.
 */
export async function compareBranches(
  repo: string,
  base: string,
  head: string
): Promise<{
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
    { headers, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Compare failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    aheadBy: data.ahead_by ?? 0,
    behindBy: data.behind_by ?? 0,
    totalCommits: data.total_commits ?? 0,
    commits: (data.commits || []).map((c: Record<string, unknown>) => ({
      sha: (c.sha as string) || '',
      message: ((c.commit as Record<string, unknown>)?.message as string) || '',
      author: ((c.commit as Record<string, unknown>)?.author as Record<string, unknown>)?.name as string || (c.author as Record<string, unknown>)?.login as string || 'unknown',
      date: ((c.commit as Record<string, unknown>)?.author as Record<string, unknown>)?.date as string || '',
    })),
    files: (data.files || []).map((f: Record<string, unknown>) => ({
      filename: f.filename as string,
      status: f.status as string,
      additions: f.additions as number,
      deletions: f.deletions as number,
    })),
  };
}

/**
 * Merge one branch into another.
 */
export async function mergeBranches(
  repo: string,
  base: string,
  head: string,
  commitMessage?: string
): Promise<{ merged: boolean; message: string; sha?: string }> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/merges`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base,
        head,
        commit_message: commitMessage || `Merge ${head} into ${base}`,
      }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (res.status === 201) {
    const data = await res.json();
    return { merged: true, message: 'Merged successfully', sha: data.sha };
  }
  if (res.status === 204) {
    return { merged: true, message: 'Nothing to merge (already up to date)' };
  }
  if (res.status === 409) {
    return { merged: false, message: 'Merge conflict — resolve manually on GitHub' };
  }
  const data = await res.json().catch(() => ({}));
  return { merged: false, message: data.message || `Merge failed (${res.status})` };
}

// ── Commits ───────────────────────────────────────────────────────────────────

export interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
  repo: string;
  url: string;
  additions?: number;
  deletions?: number;
  filesChanged?: number;
}

/**
 * List recent commits across repos.
 */
export async function listCommits(
  repo?: string,
  branch?: string,
  perPage = 30
): Promise<Commit[]> {
  const headers = getGitHubHeaders();
  const repos = repo ? [repo] : REPOS;
  const all: Commit[] = [];

  for (const r of repos) {
    try {
      const branchParam = branch ? `&sha=${encodeURIComponent(branch)}` : '';
      const res = await fetch(
        `https://api.github.com/repos/${r}/commits?per_page=${perPage}${branchParam}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const commits = await res.json();
      for (const c of commits) {
        all.push({
          sha: c.sha,
          shortSha: c.sha.slice(0, 7),
          message: c.commit?.message || '',
          author: c.commit?.author?.name || c.author?.login || 'unknown',
          authorAvatar: c.author?.avatar_url || '',
          date: c.commit?.author?.date || '',
          repo: r,
          url: c.html_url || '',
        });
      }
    } catch { /* skip */ }
  }

  return all.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Get a single commit detail with file changes.
 */
export async function getCommitDetail(
  repo: string,
  sha: string
): Promise<{
  sha: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
  files: Array<{ filename: string; status: string; additions: number; deletions: number; patch: string }>;
}> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits/${sha}`,
    { headers, signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const c = await res.json();
  return {
    sha: c.sha,
    message: c.commit?.message || '',
    author: c.commit?.author?.name || c.author?.login || 'unknown',
    date: c.commit?.author?.date || '',
    additions: c.stats?.additions || 0,
    deletions: c.stats?.deletions || 0,
    files: (c.files || []).map((f: Record<string, unknown>) => ({
      filename: f.filename as string,
      status: f.status as string,
      additions: f.additions as number,
      deletions: f.deletions as number,
      patch: (f.patch as string) || '',
    })),
  };
}

// ── GitHub Actions ────────────────────────────────────────────────────────────

export interface WorkflowRun {
  id: number;
  name: string;
  workflowId: number;
  status: string;      // queued, in_progress, completed
  conclusion: string | null;  // success, failure, cancelled, skipped
  branch: string;
  event: string;       // push, pull_request, workflow_dispatch, schedule
  actor: string;
  repo: string;
  runNumber: number;
  runAttempt: number;
  createdAt: string;
  updatedAt: string;
  url: string;
  headSha: string;
  headMessage: string;
}

export interface WorkflowRunJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

/**
 * List workflow runs across repos.
 */
export async function listWorkflowRuns(
  repo?: string,
  opts?: { branch?: string; status?: string; perPage?: number }
): Promise<WorkflowRun[]> {
  const headers = getGitHubHeaders();
  const repos = repo ? [repo] : REPOS;
  const perPage = opts?.perPage || 20;
  const all: WorkflowRun[] = [];

  for (const r of repos) {
    try {
      let params = `per_page=${perPage}`;
      if (opts?.branch) params += `&branch=${encodeURIComponent(opts.branch)}`;
      if (opts?.status) params += `&status=${encodeURIComponent(opts.status)}`;
      const res = await fetch(
        `https://api.github.com/repos/${r}/actions/runs?${params}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const data = await res.json();
      for (const run of data.workflow_runs || []) {
        all.push({
          id: run.id,
          name: run.name || run.display_title || '',
          workflowId: run.workflow_id,
          status: run.status,
          conclusion: run.conclusion,
          branch: run.head_branch || '',
          event: run.event || '',
          actor: run.actor?.login || 'unknown',
          repo: r,
          runNumber: run.run_number,
          runAttempt: run.run_attempt || 1,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
          url: run.html_url || '',
          headSha: run.head_sha?.slice(0, 7) || '',
          headMessage: run.head_commit?.message || '',
        });
      }
    } catch { /* skip */ }
  }

  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Get jobs for a workflow run (includes step details).
 */
export async function getWorkflowRunJobs(
  repo: string,
  runId: number
): Promise<WorkflowRunJob[]> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/jobs`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const data = await res.json();

  return (data.jobs || []).map((j: Record<string, unknown>) => ({
    id: j.id as number,
    name: j.name as string,
    status: j.status as string,
    conclusion: j.conclusion as string | null,
    startedAt: j.started_at as string | null,
    completedAt: j.completed_at as string | null,
    steps: ((j.steps as Array<Record<string, unknown>>) || []).map((s) => ({
      name: s.name as string,
      status: s.status as string,
      conclusion: s.conclusion as string | null,
      number: s.number as number,
      startedAt: s.started_at as string | null,
      completedAt: s.completed_at as string | null,
    })),
  }));
}

/**
 * Get logs (plain text) for a workflow run job.
 */
export async function getWorkflowRunLogs(
  repo: string,
  runId: number
): Promise<string> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/logs`,
    { headers, signal: AbortSignal.timeout(15000), redirect: 'follow' }
  );
  // GitHub redirects to a zip download URL
  if (res.status === 302 || res.headers.get('content-type')?.includes('zip')) {
    return '[Logs available as ZIP download — open on GitHub]';
  }
  if (!res.ok) return `[Failed to fetch logs: ${res.status}]`;
  return await res.text();
}

/**
 * Re-run a workflow run.
 */
export async function rerunWorkflow(
  repo: string,
  runId: number
): Promise<{ success: boolean; message: string }> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/rerun`,
    { method: 'POST', headers, signal: AbortSignal.timeout(10000) }
  );
  if (res.status === 201 || res.ok) return { success: true, message: 'Re-run triggered' };
  const data = await res.json().catch(() => ({}));
  return { success: false, message: data.message || `Re-run failed (${res.status})` };
}

/**
 * Cancel a running workflow run.
 */
export async function cancelWorkflowRun(
  repo: string,
  runId: number
): Promise<{ success: boolean; message: string }> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/runs/${runId}/cancel`,
    { method: 'POST', headers, signal: AbortSignal.timeout(10000) }
  );
  if (res.status === 202 || res.ok) return { success: true, message: 'Run cancelled' };
  const data = await res.json().catch(() => ({}));
  return { success: false, message: data.message || `Cancel failed (${res.status})` };
}

/**
 * List all PRs (open + closed) for a repo.
 */
export async function listAllPRs(
  repo?: string,
  state: 'open' | 'closed' | 'all' = 'all',
  perPage = 30
): Promise<PullRequest[]> {
  const headers = getGitHubHeaders();
  const repos = repo ? [repo] : REPOS;
  const allPRs: PullRequest[] = [];

  for (const r of repos) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${r}/pulls?state=${state}&sort=updated&direction=desc&per_page=${perPage}`,
        { headers, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const prs = await res.json();
      for (const pr of prs) {
        allPRs.push({
          id: pr.id,
          number: pr.number,
          title: pr.title,
          body: pr.body || '',
          state: pr.state,
          draft: pr.draft || false,
          repo: r,
          user: pr.user?.login || 'unknown',
          branch: pr.head?.ref || '',
          baseBranch: pr.base?.ref || '',
          labels: (pr.labels || []).map((l: Record<string, unknown>) => ({ name: l.name as string, color: l.color as string })),
          reviewDecision: null,
          mergeable: pr.mergeable ?? true,
          additions: pr.additions || 0,
          deletions: pr.deletions || 0,
          changedFiles: pr.changed_files || 0,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          url: pr.html_url,
          diffUrl: pr.diff_url,
        });
      }
    } catch { /* skip */ }
  }

  return allPRs.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Get PR check runs (CI status).
 */
export async function getPRChecks(
  repo: string,
  ref: string
): Promise<Array<{ name: string; status: string; conclusion: string | null; url: string }>> {
  const headers = getGitHubHeaders();
  const res = await fetch(
    `https://api.github.com/repos/${repo}/commits/${ref}/check-runs?per_page=50`,
    { headers, signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.check_runs || []).map((cr: Record<string, unknown>) => ({
    name: cr.name as string,
    status: cr.status as string,
    conclusion: cr.conclusion as string | null,
    url: (cr.html_url as string) || '',
  }));
}
