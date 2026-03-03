/**
 * Admin AI — GitHub REST API wrapper
 *
 * PAT priority: GITHUB_AI_PAT env var → AdminAIConfig.githubPat (DB)
 * Scopes required: repo, workflow, read:org, read:user
 */

const GITHUB_API = 'https://api.github.com';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function getToken(): Promise<string> {
  if (process.env.GITHUB_AI_PAT) return process.env.GITHUB_AI_PAT;

  const { prisma } = await import('@/lib/prisma');
  const { decryptApiKey } = await import('@/lib/ai-encryption');
  const config = await prisma.adminAIConfig.findUnique({
    where: { id: 'singleton' },
    select: { githubPat: true },
  });
  if (config?.githubPat) return decryptApiKey(config.githubPat);

  throw new Error(
    'No GitHub PAT configured. Set the GITHUB_AI_PAT env var or add it in Admin AI Settings.',
  );
}

async function ghFetch(
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `GitHub API ${options.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 400)}`,
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── Read operations ───────────────────────────────────────────────────────────

export async function listRepos(org: string): Promise<unknown> {
  return ghFetch(`/orgs/${org}/repos?sort=updated&per_page=30&type=all`);
}

export async function getRepo(owner: string, repo: string): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}`);
}

export async function listBranches(
  owner: string,
  repo: string,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/branches?per_page=30`);
}

export async function listIssues(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<unknown> {
  return ghFetch(
    `/repos/${owner}/${repo}/issues?state=${state}&per_page=30&sort=updated`,
  );
}

export async function listPRs(
  owner: string,
  repo: string,
  state: 'open' | 'closed' | 'all' = 'open',
): Promise<unknown> {
  return ghFetch(
    `/repos/${owner}/${repo}/pulls?state=${state}&per_page=30&sort=updated`,
  );
}

export async function getPR(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`);
}

export async function listWorkflowRuns(
  owner: string,
  repo: string,
  limit = 10,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/actions/runs?per_page=${limit}`);
}

export async function getWorkflowRun(
  owner: string,
  repo: string,
  runId: number,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/actions/runs/${runId}`);
}

export async function getCommits(
  owner: string,
  repo: string,
  limit = 20,
  branch?: string,
): Promise<unknown> {
  const q = branch ? `&sha=${encodeURIComponent(branch)}` : '';
  return ghFetch(
    `/repos/${owner}/${repo}/commits?per_page=${limit}${q}`,
  );
}

export async function getFileContent(
  owner: string,
  repo: string,
  filePath: string,
  ref?: string,
): Promise<string> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : '';
  const data = (await ghFetch(
    `/repos/${owner}/${repo}/contents/${filePath}${q}`,
  )) as { content?: string; encoding?: string };
  if (data.content && data.encoding === 'base64') {
    return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString(
      'utf-8',
    );
  }
  return JSON.stringify(data);
}

export async function searchCode(query: string): Promise<unknown> {
  return ghFetch(
    `/search/code?q=${encodeURIComponent(query)}&per_page=10`,
  );
}

export async function searchIssues(query: string): Promise<unknown> {
  return ghFetch(
    `/search/issues?q=${encodeURIComponent(query)}&per_page=20&sort=updated`,
  );
}

// ── Write / action operations ─────────────────────────────────────────────────

export async function triggerWorkflow(
  owner: string,
  repo: string,
  workflow: string,
  ref: string,
  inputs: Record<string, string> = {},
): Promise<string> {
  await ghFetch(
    `/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      body: JSON.stringify({ ref, inputs }),
    },
  );
  return `Workflow "${workflow}" triggered on "${ref}" in ${owner}/${repo}`;
}

export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels: string[] = [],
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify({ title, body, labels }),
  });
}

export async function addIssueComment(
  owner: string,
  repo: string,
  issueNumber: number,
  body: string,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function closeIssue(
  owner: string,
  repo: string,
  issueNumber: number,
): Promise<unknown> {
  return ghFetch(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: JSON.stringify({ state: 'closed' }),
  });
}
