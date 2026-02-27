/**
 * GitHub Commit & PR utilities — creates branches, commits files, opens PRs.
 * Used by the agent loop engine to push implementation changes.
 *
 * Uses the Git Trees API for atomic multi-file commits.
 */

const GITHUB_API = 'https://api.github.com';

interface FileChange {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

interface CommitResult {
  sha: string;
  branch: string;
  url: string;
}

interface PRResult {
  number: number;
  url: string;
  title: string;
}

function getHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN not configured');
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function ghFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: getHeaders(), ...options });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

// ── Branch operations ────────────────────────────

/**
 * Get the SHA of the latest commit on a branch.
 */
async function getBranchSHA(repo: string, branch: string): Promise<string> {
  const data = await ghFetch<{ object: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/ref/heads/${branch}`
  );
  return data.object.sha;
}

/**
 * Create a new branch from a base branch.
 * Returns silently if branch already exists.
 */
async function createBranch(repo: string, branchName: string, baseBranch: string): Promise<string> {
  const baseSHA = await getBranchSHA(repo, baseBranch);

  try {
    await ghFetch<{ ref: string }>(
      `${GITHUB_API}/repos/${repo}/git/refs`,
      {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${branchName}`,
          sha: baseSHA,
        }),
      }
    );
  } catch (err) {
    // Branch may already exist — check if that's the error
    if (err instanceof Error && err.message.includes('422')) {
      console.log(`[GitHub] Branch ${branchName} already exists on ${repo}`);
    } else {
      throw err;
    }
  }

  return baseSHA;
}

// ── Commit operations (Git Trees API) ────────────

/**
 * Commit multiple file changes atomically using the Git Trees API.
 *
 * Steps:
 * 1. Create blobs for each file
 * 2. Create a new tree with the blobs
 * 3. Create a commit pointing to the new tree
 * 4. Update the branch reference
 */
export async function commitFiles(
  repo: string,
  branch: string,
  baseBranch: string,
  files: FileChange[],
  message: string
): Promise<CommitResult> {
  if (files.length === 0) throw new Error('No files to commit');

  // Ensure branch exists
  await createBranch(repo, branch, baseBranch);
  const branchSHA = await getBranchSHA(repo, branch);

  // Get the base tree
  const commitData = await ghFetch<{ tree: { sha: string } }>(
    `${GITHUB_API}/repos/${repo}/git/commits/${branchSHA}`
  );
  const baseTreeSHA = commitData.tree.sha;

  // Create blobs and build tree entries
  const treeEntries: Array<{
    path: string;
    mode: '100644';
    type: 'blob';
    sha: string | null;
  }> = [];

  for (const file of files) {
    if (file.action === 'delete') {
      // For deletions, set sha to null (GitHub will remove the file)
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
    } else {
      // Create blob for new/updated files
      const blob = await ghFetch<{ sha: string }>(
        `${GITHUB_API}/repos/${repo}/git/blobs`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: file.content,
            encoding: 'utf-8',
          }),
        }
      );
      treeEntries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      });
    }
  }

  // Create new tree
  const newTree = await ghFetch<{ sha: string }>(
    `${GITHUB_API}/repos/${repo}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSHA,
        tree: treeEntries,
      }),
    }
  );

  // Create commit
  const newCommit = await ghFetch<{ sha: string; html_url: string }>(
    `${GITHUB_API}/repos/${repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [branchSHA],
      }),
    }
  );

  // Update branch reference
  await ghFetch(
    `${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha }),
    }
  );

  return {
    sha: newCommit.sha,
    branch,
    url: newCommit.html_url,
  };
}

// ── PR operations ────────────────────────────────

/**
 * Create a pull request. Returns existing PR if one already exists for this branch.
 */
export async function createPullRequest(
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
  labels?: string[]
): Promise<PRResult> {
  // Check for existing PR from this branch
  try {
    const existing = await ghFetch<Array<{ number: number; html_url: string; title: string }>>(
      `${GITHUB_API}/repos/${repo}/pulls?head=${repo.split('/')[0]}:${head}&base=${base}&state=open`
    );
    if (existing.length > 0) {
      // Update body of existing PR
      await ghFetch(
        `${GITHUB_API}/repos/${repo}/pulls/${existing[0].number}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ body }),
        }
      );
      return { number: existing[0].number, url: existing[0].html_url, title: existing[0].title };
    }
  } catch {
    // Ignore — will create new PR
  }

  const pr = await ghFetch<{ number: number; html_url: string; title: string }>(
    `${GITHUB_API}/repos/${repo}/pulls`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        head,
        base,
      }),
    }
  );

  // Add labels if specified
  if (labels && labels.length > 0) {
    try {
      await ghFetch(
        `${GITHUB_API}/repos/${repo}/issues/${pr.number}/labels`,
        {
          method: 'POST',
          body: JSON.stringify({ labels }),
        }
      );
    } catch {
      // Labels may not exist — non-fatal
    }
  }

  return { number: pr.number, url: pr.html_url, title: pr.title };
}

// ── Repo detection ───────────────────────────────

const WEB_PATTERNS = [
  /^src\//,
  /^prisma\//,
  /^public\//,
  /^styles\//,
  /^next\.config/,
  /^package\.json$/,
  /^tailwind\.config/,
  /^tsconfig/,
  /^\.env/,
  /^middleware\.ts$/,
];

const APP_PATTERNS = [
  /^DeepTerm\//,
  /^Sources\//,
  /^Pods\//,
  /\.swift$/,
  /\.xcodeproj/,
  /\.xcworkspace/,
  /^Podfile/,
  /^Package\.swift$/,
  /\.entitlements$/,
  /\.plist$/,
];

/**
 * Detect which repo a file path belongs to.
 * Returns 'web', 'app', or 'unknown'.
 */
export function detectRepo(filePath: string): 'web' | 'app' | 'unknown' {
  if (WEB_PATTERNS.some(p => p.test(filePath))) return 'web';
  if (APP_PATTERNS.some(p => p.test(filePath))) return 'app';
  return 'unknown';
}

/**
 * Group file changes by repo.
 */
export function groupByRepo(
  files: FileChange[],
  defaultRepo: string
): Map<string, FileChange[]> {
  const WEB_REPO = 'deblasioluca/deepterm-web';
  const APP_REPO = 'deblasioluca/deepterm';

  const groups = new Map<string, FileChange[]>();

  for (const file of files) {
    const detected = detectRepo(file.path);
    let repo: string;
    if (detected === 'web') repo = WEB_REPO;
    else if (detected === 'app') repo = APP_REPO;
    else repo = defaultRepo;

    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push(file);
  }

  return groups;
}
