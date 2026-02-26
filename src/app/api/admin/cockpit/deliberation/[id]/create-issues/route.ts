import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

interface Finding {
  title: string;
  body: string;
  severity: string;
  labels: string[];
  consensusLevel: string;
  agentsAgreed: string[];
}

// POST: Create GitHub issues from architecture review findings
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    if (!ghToken) {
      return NextResponse.json({ error: 'GITHUB_TOKEN not configured' }, { status: 500 });
    }

    const deliberation = await prisma.deliberation.findUnique({
      where: { id: params.id },
      include: {
        proposals: { orderBy: { createdAt: 'asc' } },
        debates: { orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    if (!deliberation) {
      return NextResponse.json({ error: 'Deliberation not found' }, { status: 404 });
    }
    if (!deliberation.summary) {
      return NextResponse.json({ error: 'No synthesis summary to extract findings from' }, { status: 400 });
    }

    // Build full context so AI can determine consensus across agents
    const proposalContext = deliberation.proposals
      .map(p => `### ${p.agentName}'s Proposal\n${p.content}`)
      .join('\n\n---\n\n');

    const debateContext = deliberation.debates
      .map(d => `### Round ${d.round} — ${d.agentName}\n${d.content}`)
      .join('\n\n');

    const fullContext = [
      '## Synthesis\n' + deliberation.summary,
      proposalContext ? '## Agent Proposals\n' + proposalContext : '',
      debateContext ? '## Agent Debate\n' + debateContext : '',
    ].filter(Boolean).join('\n\n');

    // Use AI to extract structured findings with consensus metadata
    const aiResponse = await callAI(
      'issues.create-from-review',
      `Extract actionable findings from an architecture review. Return a JSON array only, no other text.

Each item must have:
{
  "title": "short descriptive title",
  "body": "detailed description with recommendation",
  "severity": "critical" | "high" | "medium" | "low",
  "labels": ["optional", "extra", "labels"],
  "consensusLevel": "full" | "majority" | "partial" | "none",
  "agentsAgreed": ["list of agent names who raised or agreed with this finding"]
}

Consensus rules based on the proposals and debate:
- "full": ALL agents raised or agreed on this point
- "majority": Most agents (3+ of 4, or 2 of 3) mentioned or agreed
- "partial": At least 2 agents mentioned it
- "none": Only 1 agent raised this

Only include findings with severity "critical" or "high", OR consensus "full" or "majority".
Exclude low-priority findings that only one agent mentioned.`,
      [{ role: 'user', content: fullContext }],
      { maxTokens: 2048 }
    );

    const text = aiResponse.content;

    // Parse findings JSON — try direct parse, then code block extraction
    let findings: Finding[] = [];
    try {
      findings = JSON.parse(text);
    } catch {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        try {
          findings = JSON.parse(match[0]);
        } catch { /* empty */ }
      }
    }

    if (findings.length === 0) {
      return NextResponse.json({ error: 'No actionable findings extracted', raw: text }, { status: 422 });
    }

    // ── Duplicate detection ──────────────────────────────────

    // Load local open issues for fast pre-filter
    const localOpenIssues = await prisma.githubIssue.findMany({
      where: { state: 'open' },
      select: { number: true, title: true },
    });

    const ghHeaders = {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };

    const findDuplicate = async (title: string): Promise<{ number: number; title: string } | null> => {
      const searchTitle = title.toLowerCase();

      // 1. Fast local pre-filter: substring match on existing open issue titles
      const localMatch = localOpenIssues.find(issue => {
        const existing = issue.title.toLowerCase();
        return existing.includes(searchTitle) || searchTitle.includes(existing);
      });
      if (localMatch) return localMatch;

      // 2. GitHub Search API for fuzzy matching
      try {
        const searchTerms = title
          .replace(/\[.*?\]/g, '')  // Remove bracket prefixes
          .split(/\s+/)
          .filter(w => w.length > 3)
          .slice(0, 3)
          .join(' ');

        if (!searchTerms) return null;

        const searchRes = await fetch(
          `https://api.github.com/search/issues?q=repo:deblasioluca/deepterm+is:issue+is:open+${encodeURIComponent(searchTerms)}+in:title`,
          { headers: ghHeaders }
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.total_count > 0) {
            const match = searchData.items[0];
            return { number: match.number, title: match.title };
          }
        }
      } catch {
        // GitHub search failure is non-fatal; proceed with creation
      }

      return null;
    }

    // ── Create GitHub issues ─────────────────────────────────

    const created: Array<{ number: number; title: string; url: string; consensusLevel: string }> = [];
    const skipped: Array<{ title: string; reason: string; duplicateOf?: number }> = [];

    for (const finding of findings) {
      const fullTitle = `[Arch Review] ${finding.title}`;

      // Check for duplicates
      const duplicate = await findDuplicate(finding.title);
      if (duplicate) {
        skipped.push({
          title: fullTitle,
          reason: `Potential duplicate of #${duplicate.number}: ${duplicate.title}`,
          duplicateOf: duplicate.number,
        });
        continue;
      }

      const consensusLevel = finding.consensusLevel || 'unknown';
      const agentsAgreed = finding.agentsAgreed || [];

      const consensusLine = (consensusLevel === 'full' || consensusLevel === 'majority')
        ? `**Consensus:** ${consensusLevel.toUpperCase()} — ${agentsAgreed.join(', ')}\n`
        : '';

      const labels = [
        'architecture',
        'ai-review',
        `severity:${finding.severity}`,
        ...(consensusLevel === 'full' ? ['consensus:full'] : []),
        ...(consensusLevel === 'majority' ? ['consensus:majority'] : []),
        ...(finding.labels || []),
      ];

      const res = await fetch('https://api.github.com/repos/deblasioluca/deepterm/issues', {
        method: 'POST',
        headers: ghHeaders,
        body: JSON.stringify({
          title: fullTitle,
          body: `## Architecture Review Finding\n\n**Severity:** ${finding.severity}\n${consensusLine}\n${finding.body}\n\n---\n*Generated by AI Architecture Review (Deliberation: ${deliberation.id})*`,
          labels,
        }),
      });

      if (res.ok) {
        const issue = await res.json();
        created.push({
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          consensusLevel,
        });

        // Sync to local DB
        try {
          const { upsertGithubIssue } = await import('@/lib/github-sync');
          await upsertGithubIssue(issue);
        } catch { /* non-critical */ }
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      total: findings.length,
      message: `Created ${created.length}/${findings.length} GitHub issues${skipped.length > 0 ? ` (${skipped.length} skipped as duplicates)` : ''}`,
    });
  } catch (error) {
    console.error('Create issues error:', error);
    return NextResponse.json({ error: 'Failed to create issues' }, { status: 500 });
  }
}
