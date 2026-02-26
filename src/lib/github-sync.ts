/**
 * GitHub Issues Sync
 *
 * One-way sync: GitHub → local DB.
 * Used by the cockpit "Sync Now" action and the webhook issues handler.
 */

import { prisma } from '@/lib/prisma';

const GITHUB_REPO = 'deblasioluca/deepterm';

interface GitHubApiIssue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  labels: Array<{ name: string; color: string }>;
  milestone: { title: string } | null;
  assignee: { login: string } | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  pull_request?: unknown;
}

/**
 * Upsert a single GitHub issue into the local database.
 */
export async function upsertGithubIssue(issue: GitHubApiIssue) {
  const labels = issue.labels?.map((l) => ({ name: l.name, color: l.color })) || [];

  return prisma.githubIssue.upsert({
    where: { number: issue.number },
    update: {
      title: issue.title,
      body: issue.body || '',
      state: issue.state,
      labels: JSON.stringify(labels),
      milestone: issue.milestone?.title || null,
      assignee: issue.assignee?.login || null,
      url: issue.html_url,
      githubUpdatedAt: new Date(issue.updated_at),
      syncedAt: new Date(),
    },
    create: {
      number: issue.number,
      title: issue.title,
      body: issue.body || '',
      state: issue.state,
      labels: JSON.stringify(labels),
      milestone: issue.milestone?.title || null,
      assignee: issue.assignee?.login || null,
      url: issue.html_url,
      githubCreatedAt: new Date(issue.created_at),
      githubUpdatedAt: new Date(issue.updated_at),
      syncedAt: new Date(),
    },
  });
}

/**
 * Full sync: fetch all issues from GitHub API and upsert into the local DB.
 * Fetches all open issues (paginated) + 30 most recently closed.
 */
export async function syncAllGithubIssues(): Promise<{ synced: number; errors: number }> {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) throw new Error('GITHUB_TOKEN not configured');

  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
  };

  let synced = 0;
  let errors = 0;

  const fetches = [
    { state: 'open', perPage: 100 },
    { state: 'closed', perPage: 30 },
  ];

  for (const { state, perPage } of fetches) {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const url = `https://api.github.com/repos/${GITHUB_REPO}/issues?state=${state}&per_page=${perPage}&page=${page}&sort=updated&direction=desc`;
      const res = await fetch(url, { headers });

      if (!res.ok) {
        console.error(`[GitHub Sync] API error: ${res.status} for state=${state} page=${page}`);
        errors++;
        break;
      }

      const items: GitHubApiIssue[] = await res.json();
      const issues = items.filter((i) => !i.pull_request);

      for (const issue of issues) {
        try {
          await upsertGithubIssue(issue);
          synced++;
        } catch (err) {
          console.error(`[GitHub Sync] Failed to upsert #${issue.number}:`, err);
          errors++;
        }
      }

      // Stop: fewer results than requested, or closed issues only need one page
      if (items.length < perPage || state === 'closed') {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  console.log(`[GitHub Sync] Complete: ${synced} synced, ${errors} errors`);
  return { synced, errors };
}
