import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAnthropic } from '@/lib/claude';
import { getRepoContext } from '@/lib/repo-context';

export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are a product manager for DeepTerm, a professional SSH client platform (macOS, Windows, Linux, iOS).
The web application is built with Next.js 14, TypeScript, Prisma/SQLite, and Tailwind CSS.

Your job is to analyze the current GitHub issues backlog, triage queue, and existing planning state, then propose new Epics with Stories that logically group related work.

Rules:
- Group related GitHub issues into coherent Epics (2-5 stories per epic)
- Each Story should represent a concrete, implementable unit of work
- Link Stories to GitHub issue numbers where a direct relationship exists
- Set githubIssueNumber to null for stories that don't map to a specific issue
- Assign priorities: bug/security labels → high/critical, enhancement → medium, docs/chore → low
- Do NOT duplicate existing epics or stories — check the "Existing Planning" context
- If there are triage items (user-reported issues/ideas), consider incorporating approved ones
- Keep titles concise (under 60 chars) and descriptions actionable (1-2 sentences)
- Only propose epics if there's meaningful work to group — don't force groupings
- Write a brief summary explaining your reasoning

Return valid JSON matching the required schema.`;

const PROPOSAL_SCHEMA = {
  type: 'object' as const,
  properties: {
    proposals: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          title: { type: 'string' as const },
          description: { type: 'string' as const },
          priority: { type: 'string' as const, enum: ['critical', 'high', 'medium', 'low'] },
          stories: {
            type: 'array' as const,
            items: {
              type: 'object' as const,
              properties: {
                title: { type: 'string' as const },
                description: { type: 'string' as const },
                priority: { type: 'string' as const, enum: ['critical', 'high', 'medium', 'low'] },
                githubIssueNumber: { type: ['integer', 'null'] as const },
              },
              required: ['title', 'description', 'priority', 'githubIssueNumber'] as const,
              additionalProperties: false,
            },
          },
        },
        required: ['title', 'description', 'priority', 'stories'] as const,
        additionalProperties: false,
      },
    },
    summary: { type: 'string' as const },
  },
  required: ['proposals', 'summary'] as const,
  additionalProperties: false,
};

async function getGithubIssues() {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return [];

  try {
    const headers = { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' };
    const res = await fetch(
      'https://api.github.com/repos/deblasioluca/deepterm/issues?state=open&per_page=50&sort=updated&direction=desc',
      { headers }
    );
    if (!res.ok) return [];
    const items = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.filter((i: any) => !i.pull_request).map((issue: any) => ({
      number: issue.number,
      title: issue.title,
      labels: issue.labels?.map((l: { name: string }) => l.name) || [],
      assignee: issue.assignee?.login || null,
    }));
  } catch {
    return [];
  }
}

async function getExistingPlanning() {
  try {
    const [epics, unassignedStories] = await Promise.all([
      prisma.epic.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { stories: { orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.story.findMany({
        where: { epicId: null },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return { epics, unassignedStories };
  } catch {
    return { epics: [], unassignedStories: [] };
  }
}

async function getTriageItems() {
  try {
    const [issues, ideas] = await Promise.all([
      prisma.issue.findMany({
        where: { status: 'open' },
        take: 10,
        select: { title: true, description: true, area: true },
      }),
      prisma.idea.findMany({
        where: { status: 'consideration' },
        take: 10,
        select: { title: true, description: true, category: true },
      }),
    ]);
    return { issues, ideas };
  } catch {
    return { issues: [], ideas: [] };
  }
}

export async function POST() {
  try {
    const [githubIssues, planning, triage] = await Promise.all([
      getGithubIssues(),
      getExistingPlanning(),
      getTriageItems(),
    ]);

    if (githubIssues.length === 0 && triage.issues.length === 0 && triage.ideas.length === 0) {
      return NextResponse.json({
        proposals: [],
        summary: 'No open GitHub issues or triage items found to generate proposals from.',
      });
    }

    // Build context prompt
    const contextParts: string[] = [];

    if (githubIssues.length > 0) {
      contextParts.push('## Open GitHub Issues\n' + githubIssues.map(
        (i: { number: number; title: string; labels: string[]; assignee: string | null }) =>
          `- #${i.number}: ${i.title} [${i.labels.join(', ')}]${i.assignee ? ` (assigned: ${i.assignee})` : ''}`
      ).join('\n'));
    }

    if (planning.epics.length > 0 || planning.unassignedStories.length > 0) {
      const epicLines = planning.epics.map(e =>
        `- Epic: "${e.title}" (${e.status}, ${e.priority}) — ${e.stories.length} stories: ${e.stories.map(s => `"${s.title}"${s.githubIssueNumber ? ` #${s.githubIssueNumber}` : ''}`).join(', ')}`
      );
      const unassignedLines = planning.unassignedStories.map(s =>
        `- Unassigned Story: "${s.title}" (${s.status})${s.githubIssueNumber ? ` #${s.githubIssueNumber}` : ''}`
      );
      contextParts.push('## Existing Planning (do NOT duplicate)\n' + [...epicLines, ...unassignedLines].join('\n'));
    }

    if (triage.issues.length > 0) {
      contextParts.push('## Triage Queue — User-Reported Issues\n' + triage.issues.map(
        (i: { title: string; description: string; area: string }) => `- [${i.area}] ${i.title}: ${i.description.slice(0, 100)}`
      ).join('\n'));
    }

    if (triage.ideas.length > 0) {
      contextParts.push('## Triage Queue — Feature Ideas\n' + triage.ideas.map(
        (i: { title: string; description: string; category: string }) => `- [${i.category}] ${i.title}: ${i.description.slice(0, 100)}`
      ).join('\n'));
    }

    // Fetch repo context (cached) so AI understands the codebase
    const repoContext = await getRepoContext();
    if (repoContext) {
      contextParts.push('## Repository Context\n' + repoContext);
    }

    const userMessage = `Analyze the following backlog and propose Epics with Stories:\n\n${contextParts.join('\n\n')}`;

    const client = getAnthropic();
    console.log('[AI Propose] Calling Claude API with repo context...');
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });
    console.log('[AI Propose] Claude responded, stop_reason:', response.stop_reason);

    // Extract text from response (skip thinking blocks)
    const textBlocks = response.content.filter(b => b.type === 'text');
    if (textBlocks.length === 0) {
      return NextResponse.json({ error: 'No text response from AI' }, { status: 500 });
    }
    const fullText = textBlocks.map(b => b.type === 'text' ? b.text : '').join('\n');

    // Extract JSON from the response — Claude may wrap it in markdown or add explanation text
    let parsed: { proposals?: unknown[]; summary?: string };
    try {
      // Try direct parse first
      parsed = JSON.parse(fullText.trim());
    } catch {
      // Try extracting JSON from markdown code blocks
      const codeBlockMatch = fullText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (codeBlockMatch) {
        try {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } catch {
          // Try finding a JSON object in the text
          const jsonMatch = fullText.match(/\{[\s\S]*"proposals"[\s\S]*\}/);
          if (jsonMatch) {
            try {
              parsed = JSON.parse(jsonMatch[0]);
            } catch {
              console.error('[AI Propose] Failed to parse JSON from response:', fullText.slice(0, 500));
              return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
            }
          } else {
            console.error('[AI Propose] No JSON found in response:', fullText.slice(0, 500));
            return NextResponse.json({ error: 'AI response did not contain valid JSON' }, { status: 500 });
          }
        }
      } else {
        // Try finding a JSON object in the text
        const jsonMatch = fullText.match(/\{[\s\S]*"proposals"[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch {
            console.error('[AI Propose] Failed to parse JSON from response:', fullText.slice(0, 500));
            return NextResponse.json({ error: 'Failed to parse AI response' }, { status: 500 });
          }
        } else {
          console.error('[AI Propose] No JSON found in response:', fullText.slice(0, 500));
          return NextResponse.json({ error: 'AI response did not contain valid JSON' }, { status: 500 });
        }
      }
    }

    // Log what we got for debugging
    console.log('[AI Propose] Parsed keys:', Object.keys(parsed));
    console.log('[AI Propose] Parsed preview:', JSON.stringify(parsed).slice(0, 300));

    // Try to find the proposals array — Claude might use different key names
    let proposalsArray = parsed.proposals;
    if (!Array.isArray(proposalsArray)) {
      // Check for common alternative key names
      const p = parsed as Record<string, unknown>;
      for (const key of ['proposals', 'epics', 'proposed_epics', 'results', 'items']) {
        if (Array.isArray(p[key])) {
          proposalsArray = p[key] as unknown[];
          break;
        }
      }
      // If still not found, check if the parsed object itself is an array
      if (!Array.isArray(proposalsArray) && Array.isArray(parsed)) {
        proposalsArray = parsed as unknown[];
      }
    }

    if (!Array.isArray(proposalsArray)) {
      console.error('[AI Propose] Invalid response shape - no proposals array found. Keys:', Object.keys(parsed));
      return NextResponse.json({ error: 'AI returned invalid proposal format' }, { status: 500 });
    }

    // Override for validation below
    parsed.proposals = proposalsArray;

    // Sanitize: ensure each proposal has required fields
    const validProposals = parsed.proposals
      .filter((p: unknown): p is Record<string, unknown> =>
        typeof p === 'object' && p !== null && typeof (p as Record<string, unknown>).title === 'string'
      )
      .map((p: Record<string, unknown>) => ({
        title: String(p.title),
        description: String(p.description || ''),
        priority: ['critical', 'high', 'medium', 'low'].includes(String(p.priority)) ? String(p.priority) : 'medium',
        stories: Array.isArray(p.stories)
          ? (p.stories as Record<string, unknown>[])
              .filter(s => typeof s === 'object' && s !== null && typeof s.title === 'string')
              .map(s => ({
                title: String(s.title),
                description: String(s.description || ''),
                priority: ['critical', 'high', 'medium', 'low'].includes(String(s.priority)) ? String(s.priority) : 'medium',
                githubIssueNumber: typeof s.githubIssueNumber === 'number' ? s.githubIssueNumber : null,
              }))
          : [],
      }));

    console.log(`[AI Propose] Generated ${validProposals.length} proposals`);

    return NextResponse.json({
      proposals: validProposals,
      summary: String(parsed.summary || `${validProposals.length} epic(s) proposed`),
    });
  } catch (error) {
    console.error('AI propose error:', error);
    const message = error instanceof Error ? error.message : 'AI proposal generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
