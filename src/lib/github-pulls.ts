/**
 * GitHub Pull Requests helper.
 * Provides functions to list PRs, get diffs, merge, and request changes.
 */

const REPOS = ['deblasioluca/deepterm', 'deblasioluca/deepterm-web'];

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
