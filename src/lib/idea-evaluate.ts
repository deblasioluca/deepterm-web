/**
 * Evaluates an approved idea using AI with full repo context,
 * generates a detailed implementation spec, and creates a GitHub issue.
 */

import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';
import { getRepoContext } from '@/lib/repo-context';

export interface IdeaEvaluateResult {
  ok: boolean;
  issueNumber?: number;
  issueUrl?: string;
  title?: string;
  feasibility?: string;
  effort?: string;
  labels?: string[];
  error?: string;
  message?: string;
  duplicate?: boolean;
  duplicateOf?: number;
}

export async function evaluateAndConvertIdea(ideaId: string): Promise<IdeaEvaluateResult> {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) {
    return { ok: false, error: 'GITHUB_TOKEN not configured' };
  }

  const idea = await prisma.idea.findUnique({
    where: { id: ideaId },
    include: { author: { select: { name: true, email: true } }, votes: true },
  });
  if (!idea) {
    return { ok: false, error: 'Idea not found' };
  }
  if (idea.githubIssueNumber) {
    return {
      ok: false,
      error: 'Already converted',
      message: `Idea already linked to GitHub issue #${idea.githubIssueNumber}`,
      issueNumber: idea.githubIssueNumber,
    };
  }

  // ── Gather repo context ──────────────────────────────────
  const repoContext = await getRepoContext();

  // ── AI evaluation ────────────────────────────────────────
  const systemPrompt = `You are a senior software engineer and product analyst for DeepTerm, a professional SSH client platform. Given a user-submitted feature idea and the current codebase context, produce a comprehensive GitHub issue specification.

Return ONLY valid JSON with this exact structure:
{
  "title": "concise issue title",
  "feasibility": "high" | "medium" | "low",
  "effort": "small" | "medium" | "large" | "epic",
  "labels": ["label1", "label2"],
  "body": "full markdown issue body"
}

The "body" field must include:
1. **Summary** — what the feature does and why it matters
2. **Motivation** — who benefits and what problem it solves (reference the original idea author's description)
3. **Proposed Implementation** — concrete technical approach referencing actual files/modules from the codebase
4. **Acceptance Criteria** — clear, testable checklist items
5. **Technical Notes** — relevant architectural considerations, affected components, potential risks

Use the repo context to ground your implementation plan in reality — reference actual file paths, existing patterns, and architectural decisions. Be specific, not generic.`;

  const userContent = `## Feature Idea

**Title:** ${idea.title}
**Category:** ${idea.category}
**Submitted by:** ${idea.author.name || 'Anonymous'}
**Votes:** ${idea.votes.length}
**Description:**
${idea.description}

---

## Repository Context

${repoContext || 'Repository context unavailable — provide a general implementation plan.'}`;

  const aiResponse = await callAI(
    'ideas.evaluate',
    systemPrompt,
    [{ role: 'user', content: userContent }],
    { maxTokens: 4096 }
  );

  // ── Parse AI response ────────────────────────────────────
  let spec: { title: string; feasibility: string; effort: string; labels: string[]; body: string };
  const raw = aiResponse.content
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '');
  try {
    spec = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        spec = JSON.parse(match[0]);
      } catch {
        return { ok: false, error: 'Failed to parse AI response', message: raw.slice(0, 500) };
      }
    } else {
      return { ok: false, error: 'Failed to parse AI response', message: raw.slice(0, 500) };
    }
  }

  // ── Duplicate detection ──────────────────────────────────
  const ghHeaders = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };

  const localOpenIssues = await prisma.githubIssue.findMany({
    where: { state: 'open' },
    select: { number: true, title: true },
  });

  const searchTitle = spec.title.toLowerCase();
  const localDup = localOpenIssues.find(issue => {
    const existing = issue.title.toLowerCase();
    return existing.includes(searchTitle) || searchTitle.includes(existing);
  });

  if (localDup) {
    return {
      ok: false,
      duplicate: true,
      message: `Potential duplicate of #${localDup.number}: ${localDup.title}`,
      duplicateOf: localDup.number,
    };
  }

  try {
    const searchTerms = spec.title
      .replace(/\[.*?\]/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length > 3)
      .slice(0, 3)
      .join(' ');

    if (searchTerms) {
      const searchRes = await fetch(
        `https://api.github.com/search/issues?q=repo:deblasioluca/deepterm+is:issue+is:open+${encodeURIComponent(searchTerms)}+in:title`,
        { headers: ghHeaders }
      );
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        if (searchData.total_count > 0) {
          const ghMatch = searchData.items[0];
          return {
            ok: false,
            duplicate: true,
            message: `Potential duplicate of #${ghMatch.number}: ${ghMatch.title}`,
            duplicateOf: ghMatch.number,
          };
        }
      }
    }
  } catch {
    // Non-fatal — proceed with creation
  }

  // ── Create GitHub issue ──────────────────────────────────
  const labels = [
    'feature',
    'from-idea',
    `effort:${spec.effort}`,
    `feasibility:${spec.feasibility}`,
    ...(spec.labels || []),
  ];

  const issueBody = `${spec.body}

---

> **Origin:** Community Idea by ${idea.author.name || 'Anonymous'} (${idea.votes.length} votes)
> **Category:** ${idea.category}
> **Feasibility:** ${spec.feasibility} | **Effort:** ${spec.effort}
> *Generated by AI idea evaluation*`;

  const createRes = await fetch('https://api.github.com/repos/deblasioluca/deepterm/issues', {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({
      title: spec.title,
      body: issueBody,
      labels,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    return { ok: false, error: 'GitHub issue creation failed', message: `GitHub API: ${createRes.status} ${err}` };
  }

  const ghIssue = await createRes.json();

  // ── Update idea with issue link ──────────────────────────
  await prisma.idea.update({
    where: { id: ideaId },
    data: { githubIssueNumber: ghIssue.number },
  });

  // ── Sync issue to local DB ───────────────────────────────
  try {
    const { upsertGithubIssue } = await import('@/lib/github-sync');
    await upsertGithubIssue(ghIssue);
  } catch { /* non-critical */ }

  return {
    ok: true,
    issueNumber: ghIssue.number,
    issueUrl: ghIssue.html_url,
    title: ghIssue.title,
    feasibility: spec.feasibility,
    effort: spec.effort,
    labels,
  };
}
