/**
 * Agent Loop engine — orchestrates iterative AI coding loops.
 *
 * Flow: queued → running → (think → act → observe) × N → awaiting_review | completed | failed
 *
 * Each iteration:
 *   1. Think: AI reasons about the task and decides next action
 *   2. Act: AI produces code changes (file diffs, new files)
 *   3. Observe: Validate the action, record results
 *
 * The engine runs on the Pi and produces implementation plans/diffs.
 * Actual code execution can be delegated to the AI Dev Mac via Airflow.
 */

import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';
import { getRepoContext } from '@/lib/repo-context';
import type { AIMessage } from '@/lib/ai-client';

// ── Constants ────────────────────────────────────

const ITERATION_DELAY_MS = 5_000; // Delay between iterations to avoid rate limits
const MAX_CONTEXT_CHARS = 80_000; // Max chars for conversation context

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Context Building ─────────────────────────────

async function buildTaskContext(loop: {
  storyId: string | null;
  deliberationId: string | null;
  configId: string | null;
}): Promise<string> {
  const parts: string[] = [];

  // Story context
  if (loop.storyId) {
    const story = await prisma.story.findUnique({
      where: { id: loop.storyId },
      include: { epic: true },
    });
    if (story) {
      parts.push(`## Task: ${story.title}`);
      parts.push(`**Status:** ${story.status} | **Priority:** ${story.priority}`);
      if (story.description) parts.push(`**Description:**\n${story.description}`);
      
      if (story.epic) parts.push(`**Epic:** ${story.epic.title}\n${story.epic.description || ''}`);

      // Include linked GitHub issue
      if (story.githubIssueNumber) {
        const ghIssue = await prisma.githubIssue.findUnique({
          where: { number: story.githubIssueNumber },
        }).catch(() => null);
        if (ghIssue?.body) {
          parts.push(`## GitHub Issue #${ghIssue.number}\n${ghIssue.body}`);
        }
      }
    }
  }

  // Deliberation synthesis (if available)
  if (loop.deliberationId) {
    const delib = await prisma.deliberation.findUnique({
      where: { id: loop.deliberationId },
    });
    if (delib?.summary) {
      parts.push(`## Deliberation Synthesis\n${delib.summary}`);
    }
    if (delib?.managementSummary) {
      parts.push(`## Key Decisions\n${delib.managementSummary}`);
    }
  }

  // Config constraints
  if (loop.configId) {
    const config = await prisma.agentLoopConfig.findUnique({
      where: { id: loop.configId },
    });
    if (config) {
      if (config.allowedPaths !== '[]') {
        parts.push(`## Allowed File Paths\n${config.allowedPaths}`);
      }
      if (config.forbiddenPaths !== '[]') {
        parts.push(`## Forbidden File Paths (DO NOT MODIFY)\n${config.forbiddenPaths}`);
      }
      if (config.systemPrompt) {
        parts.push(`## Additional Instructions\n${config.systemPrompt}`);
      }
    }
  }

  // Repository context
  const repoCtx = await getRepoContext();
  if (repoCtx) {
    parts.push(`## Codebase Context\n${repoCtx}`);
  }

  return parts.join('\n\n');
}

// ── System Prompt ────────────────────────────────

function getSystemPrompt(config: { requireTests: boolean; requireBuild: boolean }): string {
  return `You are an expert software engineer working on the DeepTerm project.
You are executing an iterative coding loop to implement a task.

## Your Process
Each iteration, you will:
1. **Think**: Analyze the current state, what's been done, what's remaining
2. **Act**: Propose specific code changes (file modifications, new files, deletions)
3. **Observe**: The system records your changes

## Output Format
For each iteration, respond with a structured plan:

### Thinking
Explain your reasoning about what to do next.

### Action
For each file change, use this exact format:

\`\`\`file:path/to/file.ts
// Complete file content or specific changes
\`\`\`

For new files:
\`\`\`new:path/to/new-file.ts
// Full file content
\`\`\`

For deletions:
\`\`\`delete:path/to/file.ts
\`\`\`

### Files Changed
List all files modified in this iteration.

### Status
One of:
- **CONTINUE**: More work needed, will continue next iteration
- **DONE**: Implementation complete${config.requireTests ? ', tests included' : ''}${config.requireBuild ? ', ready to build' : ''}
- **BLOCKED**: Cannot proceed, explain why

## Rules
- Make focused, incremental changes each iteration
- ${config.requireTests ? 'Include tests for new functionality' : 'Tests are optional'}
- ${config.requireBuild ? 'Ensure changes compile/build correctly' : 'Build verification is optional'}
- Keep changes small and reviewable per iteration
- If you reach a stopping point, set status to DONE
- If stuck, set status to BLOCKED with explanation`;
}

// ── Iteration Parser ─────────────────────────────

interface ParsedIteration {
  thinking: string;
  action: string;
  filesChanged: string[];
  status: 'continue' | 'done' | 'blocked';
  observation: string;
}

function parseIterationResponse(content: string): ParsedIteration {
  // Extract thinking section
  const thinkingMatch = content.match(/### Thinking\s*\n([\s\S]*?)(?=### Action|### Files|$)/i);
  const thinking = thinkingMatch?.[1]?.trim() || '';

  // Extract action section
  const actionMatch = content.match(/### Action\s*\n([\s\S]*?)(?=### Files|### Status|$)/i);
  const action = actionMatch?.[1]?.trim() || content;

  // Extract files changed
  const filesMatch = content.match(/### Files Changed\s*\n([\s\S]*?)(?=### Status|$)/i);
  const filesText = filesMatch?.[1]?.trim() || '';
  const filesChanged = filesText
    .split('\n')
    .map(l => l.replace(/^[-*]\s*`?|`?\s*$/g, '').trim())
    .filter(l => l.length > 0 && l.includes('/'));

  // Also extract from code blocks
  const codeBlockFiles = Array.from(content.matchAll(/```(?:file|new|delete):(.+)/g), m => m[1].trim())

  const allFiles = Array.from(new Set([...filesChanged, ...codeBlockFiles]));

  // Extract status
  const statusMatch = content.match(/### Status\s*\n[\s\S]*?\*\*(CONTINUE|DONE|BLOCKED)\*\*/i);
  const statusRaw = statusMatch?.[1]?.toLowerCase() || 'continue';
  const status = (['continue', 'done', 'blocked'].includes(statusRaw) ? statusRaw : 'continue') as ParsedIteration['status'];

  // Build observation
  const observation = status === 'done'
    ? `Implementation complete. ${allFiles.length} files changed.`
    : status === 'blocked'
    ? `Agent is blocked. ${thinking.slice(0, 200)}`
    : `Iteration complete. ${allFiles.length} files changed. Continuing...`;

  return { thinking, action, filesChanged: allFiles, status, observation };
}

// ── Main Engine ──────────────────────────────────

/**
 * Run an agent loop to completion or failure.
 * Call fire-and-forget — updates DB records as it progresses.
 */
export async function runAgentLoop(loopId: string): Promise<void> {
  const loop = await prisma.agentLoop.findUnique({
    where: { id: loopId },
    include: { config: true },
  });
  if (!loop) throw new Error('Agent loop not found');

  // Update status to running
  await prisma.agentLoop.update({
    where: { id: loopId },
    data: { status: 'running', startedAt: new Date() },
  });

  const config = loop.config || {
    requireTests: true,
    requireBuild: true,
    maxIterations: 10,
    model: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    systemPrompt: '',
    allowedPaths: '[]',
    forbiddenPaths: '[]',
  };

  const maxIter = loop.maxIterations || config.maxIterations || 10;
  const systemPrompt = getSystemPrompt({
    requireTests: config.requireTests,
    requireBuild: config.requireBuild,
  });

  try {
    // Build initial context
    const taskContext = await buildTaskContext({
      storyId: loop.storyId,
      deliberationId: loop.deliberationId,
      configId: loop.configId,
    });

    // Conversation history for multi-turn
    const messages: AIMessage[] = [
      { role: 'user', content: `Here is the task and codebase context:\n\n${taskContext}\n\nBegin implementation. Start with iteration 1.` },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostCents = 0;
    let finalStatus: 'completed' | 'awaiting_review' | 'failed' = 'completed';

    for (let i = 1; i <= maxIter; i++) {
      // Check if cancelled
      const current = await prisma.agentLoop.findUnique({ where: { id: loopId } });
      if (current?.status === 'cancelled') {
        console.log(`[AgentLoop] ${loopId} cancelled at iteration ${i}`);
        return;
      }

      console.log(`[AgentLoop] ${loopId} iteration ${i}/${maxIter}`);

      // Create iteration record
      const iteration = await prisma.agentIteration.create({
        data: {
          loopId,
          iteration: i,
          phase: 'thinking',
        },
      });

      const iterStart = Date.now();

      try {
        // Trim conversation if too long
        let conversationText = messages.map(m => m.content).join('\n');
        while (conversationText.length > MAX_CONTEXT_CHARS && messages.length > 2) {
          // Remove oldest assistant+user pair (keep first user message)
          messages.splice(1, 2);
          conversationText = messages.map(m => m.content).join('\n');
        }

        // Call AI
        const response = await callAI(
          'agent-loop.iterate',
          systemPrompt,
          messages,
          { maxTokens: 8192, context: { agentLoopId: loopId } }
        );

        // Parse response
        const parsed = parseIterationResponse(response.content);

        // Update iteration record
        await prisma.agentIteration.update({
          where: { id: iteration.id },
          data: {
            phase: 'complete',
            thinking: parsed.thinking,
            action: parsed.action,
            observation: parsed.observation,
            filesChanged: JSON.stringify(parsed.filesChanged),
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            costCents: 0, // Cost is computed by ai-usage
            durationMs: Date.now() - iterStart,
          },
        });

        // Accumulate totals
        totalInputTokens += response.inputTokens;
        totalOutputTokens += response.outputTokens;

        // Update loop progress
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: {
            totalIterations: i,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        });

        // Add to conversation
        messages.push({ role: 'assistant', content: response.content });

        // Check completion
        if (parsed.status === 'done') {
          finalStatus = 'awaiting_review';
          console.log(`[AgentLoop] ${loopId} completed at iteration ${i}`);
          break;
        }
        if (parsed.status === 'blocked') {
          finalStatus = 'failed';
          await prisma.agentLoop.update({
            where: { id: loopId },
            data: { errorLog: `Blocked at iteration ${i}: ${parsed.observation}` },
          });
          console.log(`[AgentLoop] ${loopId} blocked at iteration ${i}`);
          break;
        }

        // Continue prompt
        messages.push({
          role: 'user',
          content: `Iteration ${i} recorded. ${parsed.filesChanged.length} files noted. Continue with iteration ${i + 1}.`,
        });

        // Delay between iterations
        if (i < maxIter) await delay(ITERATION_DELAY_MS);

      } catch (iterError) {
        console.error(`[AgentLoop] ${loopId} iteration ${i} failed:`, iterError);
        await prisma.agentIteration.update({
          where: { id: iteration.id },
          data: {
            phase: 'error',
            observation: iterError instanceof Error ? iterError.message : 'Unknown error',
            durationMs: Date.now() - iterStart,
          },
        });

        // Continue to next iteration on non-fatal errors
        messages.push({
          role: 'user',
          content: `Iteration ${i} encountered an error. Please retry from where you left off. Continue with iteration ${i + 1}.`,
        });
      }
    }

    // Finalize loop
    await prisma.agentLoop.update({
      where: { id: loopId },
      data: {
        status: finalStatus,
        completedAt: new Date(),
      },
    });

    console.log(`[AgentLoop] ${loopId} finished: ${finalStatus}`);

  } catch (error) {
    console.error(`[AgentLoop] ${loopId} fatal error:`, error);
    await prisma.agentLoop.update({
      where: { id: loopId },
      data: {
        status: 'failed',
        errorLog: error instanceof Error ? error.message : 'Unknown error',
        completedAt: new Date(),
      },
    }).catch(() => {});
  }
}

/**
 * Queue and start an agent loop.
 */
export async function createAndRunAgentLoop(params: {
  storyId?: string;
  deliberationId?: string;
  configId?: string;
  maxIterations?: number;
}): Promise<string> {
  const config = params.configId
    ? await prisma.agentLoopConfig.findUnique({ where: { id: params.configId } })
    : null;

  const loop = await prisma.agentLoop.create({
    data: {
      storyId: params.storyId || null,
      deliberationId: params.deliberationId || null,
      configId: params.configId || null,
      status: 'queued',
      maxIterations: params.maxIterations || config?.maxIterations || 10,
      branchName: params.storyId
        ? `agent/${params.storyId.slice(0, 8)}`
        : `agent/${Date.now()}`,
    },
  });

  // Fire-and-forget
  runAgentLoop(loop.id).catch(err => {
    console.error(`[AgentLoop] Background run failed for ${loop.id}:`, err);
  });

  return loop.id;
}
