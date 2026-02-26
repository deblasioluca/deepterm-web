/**
 * Deliberation engine — orchestrates multi-agent AI deliberation.
 *
 * Flow: proposing → debating (2 rounds) → voting → decided (synthesis)
 *
 * Each phase runs AI calls and stores results in the database.
 * Functions are fire-and-forget safe — they catch errors and store them
 * in the Deliberation record so the UI can display failures.
 */

import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';
import { getRepoContext } from '@/lib/repo-context';
import { getAgentsForType, type AgentConfig } from './agents';

// Delay between sequential agent calls to avoid rate limits (10s)
const AGENT_STAGGER_MS = 10_000;
// Delay between deliberation phases to let rate limit windows reset (15s)
const PHASE_DELAY_MS = 15_000;

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Context building ──────────────────────────────────────

async function buildContext(
  deliberation: { type: string; storyId: string | null; epicId: string | null; instructions: string; title: string }
): Promise<string> {
  const parts: string[] = [];

  // Target context (story or epic)
  if (deliberation.storyId) {
    const story = await prisma.story.findUnique({
      where: { id: deliberation.storyId },
      include: { epic: true },
    });
    if (story) {
      parts.push(`## Target Story\n**Title:** ${story.title}\n**Status:** ${story.status}\n**Priority:** ${story.priority}`);
      if (story.description) parts.push(`**Description:**\n${story.description}`);
      if (story.epic) parts.push(`**Epic:** ${story.epic.title}\n${story.epic.description}`);

      // Include linked GitHub issue body if available
      if (story.githubIssueNumber) {
        const ghIssue = await prisma.githubIssue.findUnique({
          where: { number: story.githubIssueNumber },
        }).catch(() => null);
        if (ghIssue?.body) {
          parts.push(`## Linked GitHub Issue #${ghIssue.number}\n${ghIssue.body}`);
        }
      }
    }
  }

  if (deliberation.epicId) {
    const epic = await prisma.epic.findUnique({
      where: { id: deliberation.epicId },
      include: { stories: true },
    });
    if (epic) {
      parts.push(`## Target Epic\n**Title:** ${epic.title}\n**Status:** ${epic.status}\n**Priority:** ${epic.priority}`);
      if (epic.description) parts.push(`**Description:**\n${epic.description}`);
      if (epic.stories.length > 0) {
        const storyList = epic.stories
          .map(s => `- [${s.status}] ${s.title} (${s.priority})${s.githubIssueNumber ? ` — GH #${s.githubIssueNumber}` : ''}`)
          .join('\n');
        parts.push(`## Stories in this Epic\n${storyList}`);
      }
    }
  }

  // Custom instructions
  if (deliberation.instructions) {
    parts.push(`## Custom Instructions\n${deliberation.instructions}`);
  }

  // Repository context (cached file tree + CLAUDE.md excerpt + schema)
  const repoCtx = await getRepoContext();
  if (repoCtx) {
    parts.push(`## Codebase Context\n${repoCtx}`);
  }

  return parts.join('\n\n');
}

// ── Helpers ───────────────────────────────────────────────

/** Extract a named section from markdown content (e.g., **Risks**: ...) */
function extractSection(content: string, label: string): string {
  // Match **Label**: or **Label** — content until next ** header or end
  const pattern = new RegExp(`\\*\\*${label}[:\\s]*\\*\\*[:\\s]*([\\s\\S]*?)(?=\\n\\*\\*[A-Z]|$)`, 'i');
  const match = content.match(pattern);
  return match?.[1]?.trim() || '';
}

// ── Phase: Proposals ──────────────────────────────────────

async function runProposalPhase(deliberationId: string, agents: AgentConfig[], context: string, type: string): Promise<void> {
  const userPrompt = type === 'implementation'
    ? `Create a detailed implementation plan for the following:\n\n${context}\n\nProvide:\n1. **Approach**: High-level strategy\n2. **Files to modify**: List each file and what changes\n3. **New files**: Any new files needed\n4. **Data model changes**: Schema/model updates if any\n5. **Test strategy**: What tests to add/update\n6. **Risks**: What could go wrong\n7. **Effort estimate**: Hours or days\n8. **Strengths of this approach**: Why it's good\n9. **Concerns**: What worries you`
    : `Review the architecture described below and provide your analysis:\n\n${context}\n\nProvide:\n1. **Findings**: Issues, concerns, and observations\n2. **Severity**: Critical / High / Medium / Low for each finding\n3. **Recommendations**: Specific fixes or improvements\n4. **Positive aspects**: What's well-designed\n5. **Summary**: Overall assessment`;

  // Run agents sequentially with stagger to avoid rate limits
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < agents.length; i++) {
    if (i > 0) await delay(AGENT_STAGGER_MS);
    const agent = agents[i];
    try {
      const response = await callAI(
        agent.activity,
        agent.systemPrompt,
        [{ role: 'user', content: userPrompt }],
        { maxTokens: 4096 }
      );

      // Extract structured fields from the proposal content
      const strengths = extractSection(response.content, 'Strengths');
      const risks = extractSection(response.content, 'Risks');
      const effort = extractSection(response.content, 'Effort estimate');

      await prisma.deliberationProposal.create({
        data: {
          deliberationId,
          agentName: agent.name,
          agentModel: response.model,
          content: response.content,
          strengths,
          risks,
          effort,
        },
      });
      results.push({ status: 'fulfilled', value: undefined });
      console.log(`[Deliberation] ${deliberationId} proposal from ${agent.name} complete`);
    } catch (err) {
      results.push({ status: 'rejected', reason: err });
      console.warn(`[Deliberation] ${deliberationId} proposal from ${agent.name} failed:`, err);
    }
  }

  // Check for failures
  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === agents.length) {
    throw new Error(`All agents failed: ${failures.map(f => f.reason?.message || 'unknown').join('; ')}`);
  }
  if (failures.length > 0) {
    console.warn(`[Deliberation] ${failures.length}/${agents.length} agents failed in proposal phase`);
  }
}

// ── Phase: Debate ─────────────────────────────────────────

async function runDebateRound(deliberationId: string, round: number, agents: AgentConfig[]): Promise<void> {
  // Load all proposals
  const proposals = await prisma.deliberationProposal.findMany({
    where: { deliberationId },
    orderBy: { createdAt: 'asc' },
  });

  // For round 2, also load round 1 debates
  let priorDebates: Array<{ agentName: string; content: string }> = [];
  if (round === 2) {
    priorDebates = await prisma.deliberationDebate.findMany({
      where: { deliberationId, round: 1 },
      orderBy: { createdAt: 'asc' },
    });
  }

  const proposalSummary = proposals
    .map(p => `### ${p.agentName}'s Proposal\n${p.content}`)
    .join('\n\n---\n\n');

  const debateSummary = priorDebates.length > 0
    ? '\n\n## Round 1 Discussion\n' + priorDebates.map(d => `### ${d.agentName}\n${d.content}`).join('\n\n')
    : '';

  // Run agents sequentially with stagger to avoid rate limits
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < agents.length; i++) {
    if (i > 0) await delay(AGENT_STAGGER_MS);
    const agent = agents[i];
    try {
      const prompt = round === 1
        ? `Here are all proposals from the team. Review each one and provide your critique:\n\n${proposalSummary}\n\nAs ${agent.name}, respond with:\n1. What you agree with in each proposal\n2. What concerns you about each proposal\n3. Specific improvements you'd suggest\n4. Your overall assessment of which approach is strongest and why`
        : `Here are the original proposals and Round 1 discussion:\n\n${proposalSummary}\n${debateSummary}\n\nAs ${agent.name}, provide your final position:\n1. Your updated recommendation considering the discussion\n2. Any remaining concerns\n3. What the team should prioritize`;

      const response = await callAI(
        'deliberation.debate',
        agent.systemPrompt,
        [{ role: 'user', content: prompt }],
        { maxTokens: 2048 }
      );

      // All proposals are referenced in each debate entry
      const proposalIds = proposals.map(p => p.id).join(',');

      await prisma.deliberationDebate.create({
        data: {
          deliberationId,
          round,
          agentName: agent.name,
          agentModel: response.model,
          content: response.content,
          referencesProposalIds: proposalIds,
        },
      });
      results.push({ status: 'fulfilled', value: undefined });
      console.log(`[Deliberation] ${deliberationId} debate R${round} from ${agent.name} complete`);
    } catch (err) {
      results.push({ status: 'rejected', reason: err });
      console.warn(`[Deliberation] ${deliberationId} debate R${round} from ${agent.name} failed:`, err);
    }
  }

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === agents.length) {
    throw new Error(`All agents failed in debate round ${round}`);
  }
}

// ── Phase: Voting ─────────────────────────────────────────

async function runVotingPhase(deliberationId: string, agents: AgentConfig[]): Promise<void> {
  const proposals = await prisma.deliberationProposal.findMany({
    where: { deliberationId },
    orderBy: { createdAt: 'asc' },
  });

  const debates = await prisma.deliberationDebate.findMany({
    where: { deliberationId },
    orderBy: [{ round: 'asc' }, { createdAt: 'asc' }],
  });

  const fullContext = [
    '## Proposals\n' + proposals.map(p => `### ${p.agentName}\n${p.content}`).join('\n\n---\n\n'),
    '## Debate\n' + debates.map(d => `### Round ${d.round} — ${d.agentName}\n${d.content}`).join('\n\n'),
  ].join('\n\n');

  const agentNames = proposals.map(p => p.agentName);

  // Run agents sequentially with stagger to avoid rate limits
  const results: PromiseSettledResult<void>[] = [];
  for (let i = 0; i < agents.length; i++) {
    if (i > 0) await delay(AGENT_STAGGER_MS);
    const agent = agents[i];
    try {
      const otherAgents = agentNames.filter(n => n !== agent.name);

      const response = await callAI(
        'deliberation.vote',
        agent.systemPrompt,
        [{
          role: 'user',
          content: `${fullContext}\n\nNow vote for the best proposal. You MUST vote for one of: ${otherAgents.join(', ')} (you cannot vote for yourself).\n\nRespond in exactly this format:\n**Vote:** [agent name]\n**Reasoning:** [1-3 sentences explaining your vote]`,
        }],
        { maxTokens: 1024 }
      );

      const text = response.content;

      // Parse vote
      const voteMatch = text.match(/\*\*Vote:\*\*\s*(.+)/i);
      const reasoningMatch = text.match(/\*\*Reasoning:\*\*\s*([\s\S]+)/i);

      let votedFor = voteMatch?.[1]?.trim() || otherAgents[0];
      // Normalize: find closest matching agent name
      const matched = agentNames.find(n => votedFor.toLowerCase().includes(n.toLowerCase()));
      if (matched) votedFor = matched;

      // Map agent name to proposal ID
      const votedProposal = proposals.find(p => p.agentName === votedFor);

      await prisma.deliberationVote.create({
        data: {
          deliberationId,
          agentName: agent.name,
          agentModel: response.model,
          votedFor,
          votedProposalId: votedProposal?.id || null,
          reasoning: reasoningMatch?.[1]?.trim() || text,
        },
      });
      results.push({ status: 'fulfilled', value: undefined });
      console.log(`[Deliberation] ${deliberationId} vote from ${agent.name}: ${votedFor}`);
    } catch (err) {
      results.push({ status: 'rejected', reason: err });
      console.warn(`[Deliberation] ${deliberationId} vote from ${agent.name} failed:`, err);
    }
  }

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  if (failures.length === agents.length) {
    throw new Error('All agents failed in voting phase');
  }
}

// ── Phase: Synthesis ──────────────────────────────────────

async function runSynthesis(deliberationId: string): Promise<string> {
  const [deliberation, proposals, debates, votes] = await Promise.all([
    prisma.deliberation.findUnique({ where: { id: deliberationId } }),
    prisma.deliberationProposal.findMany({ where: { deliberationId }, orderBy: { createdAt: 'asc' } }),
    prisma.deliberationDebate.findMany({ where: { deliberationId }, orderBy: [{ round: 'asc' }, { createdAt: 'asc' }] }),
    prisma.deliberationVote.findMany({ where: { deliberationId }, orderBy: { createdAt: 'asc' } }),
  ]);

  // Determine winner
  const voteCounts = new Map<string, number>();
  for (const v of votes) {
    voteCounts.set(v.votedFor, (voteCounts.get(v.votedFor) || 0) + 1);
  }
  const winner = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';

  const fullHistory = [
    `## Deliberation: ${deliberation?.title || 'Untitled'}`,
    '## Proposals\n' + proposals.map(p => `### ${p.agentName}\n${p.content}`).join('\n\n---\n\n'),
    '## Debate\n' + debates.map(d => `### Round ${d.round} — ${d.agentName}\n${d.content}`).join('\n\n'),
    '## Votes\n' + votes.map(v => `- **${v.agentName}** voted for **${v.votedFor}**: ${v.reasoning}`).join('\n'),
    `\n**Winner: ${winner}** (${voteCounts.get(winner) || 0} votes)`,
  ].join('\n\n');

  const isReview = deliberation?.type === 'architecture_review';

  const response = await callAI(
    'deliberation.synthesis',
    isReview
      ? 'You are synthesizing an architecture review. Produce a prioritized list of findings with severity, actionable recommendations, and a summary. Use structured markdown.'
      : 'You are synthesizing the winning implementation plan from a multi-agent deliberation. Incorporate the best insights from the debate. Produce a concrete, actionable implementation plan with specific files, changes, and steps. Use structured markdown.',
    [{
      role: 'user',
      content: `${fullHistory}\n\nSynthesize the final ${isReview ? 'review report' : 'implementation plan'}, incorporating the winning proposal from ${winner} and the best insights from the debate.`,
    }],
    { maxTokens: 4096 }
  );

  return response.content;
}

// ── Phase: Management Summary ────────────────────────────

async function runManagementSummary(deliberationId: string, synthesis: string): Promise<string> {
  const deliberation = await prisma.deliberation.findUnique({ where: { id: deliberationId } });

  const response = await callAI(
    'deliberation.management-summary',
    `You are writing a concise executive summary for a technical decision.
Produce exactly 5-8 bullet points in markdown format. Each bullet must be one clear, specific sentence.
Structure:
- **Decision:** What was decided (1 bullet)
- **Key Risks:** Main risks identified (1-2 bullets)
- **Consensus Items:** Points all reviewers agreed on (1-2 bullets)
- **Action Items:** Concrete next steps (1-2 bullets)
- **Open Questions:** Unresolved items if any (0-1 bullet)

Do NOT include headers or sections, only bullet points. Be specific and actionable, not vague.`,
    [{
      role: 'user',
      content: `Deliberation: ${deliberation?.title || 'Untitled'}\nType: ${deliberation?.type || 'implementation'}\n\n## Full Synthesis\n${synthesis}`,
    }],
    { maxTokens: 1024 }
  );

  return response.content;
}

// ── Public API ────────────────────────────────────────────

/**
 * Start a deliberation — runs the proposal phase.
 * Call this fire-and-forget; it updates the DB record on completion or failure.
 */
export async function startDeliberation(deliberationId: string): Promise<void> {
  try {
    const deliberation = await prisma.deliberation.findUnique({ where: { id: deliberationId } });
    if (!deliberation) throw new Error('Deliberation not found');

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { status: 'proposing' },
    });

    const agents = getAgentsForType(deliberation.type as 'implementation' | 'architecture_review');
    const context = await buildContext(deliberation);

    await runProposalPhase(deliberationId, agents, context, deliberation.type);

    // Delay before next phase to let rate limit windows reset
    console.log(`[Deliberation] ${deliberationId} proposals complete, waiting ${PHASE_DELAY_MS / 1000}s before debate phase`);
    await delay(PHASE_DELAY_MS);

    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { status: 'debating' },
    });

    console.log(`[Deliberation] ${deliberationId} → debating`);
  } catch (err) {
    console.error(`[Deliberation] ${deliberationId} proposal phase failed:`, err);
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'Proposal phase failed' },
    }).catch(() => {});
  }
}

/**
 * Advance a deliberation to the next phase.
 * Returns the new status.
 */
export async function advanceDeliberation(deliberationId: string): Promise<string> {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: deliberationId },
    include: { debates: true },
  });
  if (!deliberation) throw new Error('Deliberation not found');

  const agents = getAgentsForType(deliberation.type as 'implementation' | 'architecture_review');

  try {
    switch (deliberation.status) {
      case 'debating': {
        const maxRound = deliberation.debates.length > 0
          ? Math.max(...deliberation.debates.map(d => d.round))
          : 0;

        if (maxRound < 1) {
          await runDebateRound(deliberationId, 1, agents);
          console.log(`[Deliberation] ${deliberationId} debate round 1 complete, waiting ${PHASE_DELAY_MS / 1000}s`);
          await delay(PHASE_DELAY_MS);
          return 'debating'; // Still debating, round 2 needed
        }
        if (maxRound < 2) {
          await runDebateRound(deliberationId, 2, agents);
          console.log(`[Deliberation] ${deliberationId} debate complete, waiting ${PHASE_DELAY_MS / 1000}s before voting`);
          await delay(PHASE_DELAY_MS);
          await prisma.deliberation.update({
            where: { id: deliberationId },
            data: { status: 'voting' },
          });
          console.log(`[Deliberation] ${deliberationId} → voting`);
          return 'voting';
        }
        // Both rounds done, move to voting
        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: { status: 'voting' },
        });
        return 'voting';
      }

      case 'voting': {
        await runVotingPhase(deliberationId, agents);
        // Delay before synthesis to let rate limit windows reset
        console.log(`[Deliberation] ${deliberationId} voting complete, waiting ${PHASE_DELAY_MS / 1000}s before synthesis`);
        await delay(PHASE_DELAY_MS);
        const summary = await runSynthesis(deliberationId);

        // Generate management summary (non-fatal if it fails)
        let managementSummary = '';
        try {
          console.log(`[Deliberation] ${deliberationId} synthesis complete, generating management summary`);
          await delay(PHASE_DELAY_MS);
          managementSummary = await runManagementSummary(deliberationId, summary);
          console.log(`[Deliberation] ${deliberationId} management summary generated`);
        } catch (err) {
          console.warn(`[Deliberation] ${deliberationId} management summary failed (non-fatal):`, err);
        }

        await prisma.deliberation.update({
          where: { id: deliberationId },
          data: { status: 'decided', summary, managementSummary },
        });
        console.log(`[Deliberation] ${deliberationId} voting + synthesis complete → decided`);
        return 'decided';
      }

      default:
        return deliberation.status;
    }
  } catch (err) {
    console.error(`[Deliberation] ${deliberationId} advance failed:`, err);
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'Phase failed' },
    }).catch(() => {});
    return 'failed';
  }
}

/**
 * Run all remaining phases of a deliberation to completion.
 * Call fire-and-forget.
 */
export async function runFullDeliberation(deliberationId: string): Promise<void> {
  try {
    const deliberation = await prisma.deliberation.findUnique({ where: { id: deliberationId } });
    if (!deliberation) return;

    // If still in proposing, wait for it (shouldn't happen if called after start)
    if (deliberation.status === 'proposing') {
      await startDeliberation(deliberationId);
    }

    // Run remaining phases
    let status = (await prisma.deliberation.findUnique({ where: { id: deliberationId } }))?.status || '';
    while (status === 'debating' || status === 'voting') {
      status = await advanceDeliberation(deliberationId);
    }

    console.log(`[Deliberation] ${deliberationId} full run complete: ${status}`);
  } catch (err) {
    console.error(`[Deliberation] ${deliberationId} full run failed:`, err);
    await prisma.deliberation.update({
      where: { id: deliberationId },
      data: { status: 'failed', error: err instanceof Error ? err.message : 'Full run failed' },
    }).catch(() => {});
  }
}
