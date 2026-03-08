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
import { commitFiles, createPullRequest, groupByRepo } from '@/lib/github-commit';
import { notifyAgentPR } from '@/lib/node-red';
import type { AIMessage } from '@/lib/ai-client';

// ── File Change Accumulator ──────────────────────

interface AccumulatedFile {
  path: string;
  content: string;
  action: 'create' | 'update' | 'delete';
}

/**
 * Parse file changes from an iteration's action text.
 * Supports: ```file:path, ```new:path, ```delete:path
 */
function parseFileChanges(actionText: string): AccumulatedFile[] {
  const files: AccumulatedFile[] = [];
  const blockRegex = /```(file|new|delete):([^\n]+)\n([\s\S]*?)```/g;
  let match;

  while ((match = blockRegex.exec(actionText)) !== null) {
    const [, type, path, content] = match;
    const cleanPath = path.trim();
    
    if (type === 'delete') {
      files.push({ path: cleanPath, content: '', action: 'delete' });
    } else {
      files.push({
        path: cleanPath,
        content: content.trimEnd(),
        action: type === 'new' ? 'create' : 'update',
      });
    }
  }

  return files;
}

/**
 * Merge file changes — later iterations override earlier ones for the same path.
 */
function mergeFileChanges(accumulated: AccumulatedFile[], newChanges: AccumulatedFile[]): AccumulatedFile[] {
  const map = new Map<string, AccumulatedFile>();
  for (const f of accumulated) map.set(f.path, f);
  for (const f of newChanges) map.set(f.path, f);
  return Array.from(map.values());
}

/**
 * Commit accumulated file changes and open PRs on GitHub.
 * Groups files by repo (web vs app) and creates separate PRs for each.
 */
async function commitAndOpenPRs(
  loopId: string,
  branchName: string,
  files: AccumulatedFile[],
  title: string,
  description: string,
  defaultRepo: string,
  baseBranch: string,
): Promise<{ prUrl: string | null; prNumber: number | null; allPRs: Array<{ repo: string; number: number; url: string }> }> {
  if (files.length === 0) {
    console.log('[AgentLoop] No file changes to commit');
    return { prUrl: null, prNumber: null, allPRs: [] };
  }

  const repoGroups = groupByRepo(files, defaultRepo);
  const allPRs: Array<{ repo: string; number: number; url: string }> = [];

  for (const [repo, repoFiles] of Array.from(repoGroups.entries())) {
    try {
      console.log('[AgentLoop] Committing', repoFiles.length, 'files to', repo, 'branch:', branchName);

      // Commit files
      const commitResult = await commitFiles(
        repo,
        branchName,
        baseBranch,
        repoFiles,
        `agent: ${title}\n\nAgent loop ${loopId}\n\nFiles changed:\n${repoFiles.map(f => '- ' + f.action + ': ' + f.path).join('\n')}`
      );

      console.log('[AgentLoop] Committed to', repo, ':', commitResult.sha);

      // Build PR body
      const repoLabel = repo.includes('web') ? 'Web App' : 'macOS App';
      const prBody = [
        '## 🤖 Agent Implementation',
        '',
        `**Loop:** \`${loopId}\``,
        `**Repository:** ${repoLabel} (\`${repo}\`)`,
        `**Branch:** \`${branchName}\``,
        '',
        '### Summary',
        description,
        '',
        '### Files Changed',
        ...repoFiles.map(f => `- **${f.action}**: \`${f.path}\``),
        '',
        '---',
        '*This PR was created by the DeepTerm Agent Loop. Please review before merging.*',
      ].join('\n');

      // Create PR
      const prResult = await createPullRequest(
        repo,
        branchName,
        baseBranch,
        `🤖 ${title}`,
        prBody,
        ['agent-loop', 'auto-generated']
      );

      console.log('[AgentLoop] PR opened:', prResult.url);
      allPRs.push({ repo, number: prResult.number, url: prResult.url });

    } catch (err) {
      console.error('[AgentLoop] Failed to commit/PR for', repo, ':', err);
    }
  }

  // Return the first PR (primary) for the loop record
  const primary = allPRs[0] || null;
  return {
    prUrl: primary?.url || null,
    prNumber: primary?.number || null,
    allPRs,
  };
}

// ── Constants ────────────────────────────────────

const ITERATION_DELAY_MS = 5_000; // Delay between iterations to avoid rate limits
const MAX_CONTEXT_CHARS = 80_000; // Max chars for conversation context
const MAX_CONSECUTIVE_ERRORS = 3; // Stop early after this many consecutive errors

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
export async function runAgentLoop(loopId: string, feedbackContext?: string): Promise<void> {
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
    targetRepo: 'deblasioluca/deepterm',
    targetBranch: 'main',
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
      { role: 'user', content: feedbackContext
        ? `Here is the task and codebase context:\n\n${taskContext}\n\n## Previous Attempt Feedback\nA previous attempt at this task failed. Here is the context from that attempt:\n\n${feedbackContext}\n\nPlease fix the issues from the previous attempt and complete the implementation. Start with iteration 1.`
        : `Here is the task and codebase context:\n\n${taskContext}\n\nBegin implementation. Start with iteration 1.` },
    ];

    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostCents = 0;
    let finalStatus: 'completed' | 'awaiting_review' | 'failed' = 'completed';
    let accumulatedFiles: AccumulatedFile[] = [];
    let consecutiveErrors = 0;
    let lastErrorMessage = '';

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

        // Accumulate file changes from this iteration
        const iterationFiles = parseFileChanges(response.content);
        if (iterationFiles.length > 0) {
          accumulatedFiles = mergeFileChanges(accumulatedFiles, iterationFiles);
          console.log(`[AgentLoop] ${loopId} accumulated ${accumulatedFiles.length} total files (${iterationFiles.length} from iteration ${i})`);
        }

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

        // Reset consecutive error counter on success
        consecutiveErrors = 0;
        lastErrorMessage = '';

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
        const errorMsg = iterError instanceof Error ? iterError.message : 'Unknown error';
        const errorCause = iterError instanceof Error && 'cause' in iterError
          ? String((iterError as Error & { cause?: unknown }).cause)
          : '';

        // Classify the error
        const isConnectionError = errorMsg.includes('Connection error') ||
          errorMsg.includes('fetch failed') ||
          errorCause.includes('ECONNREFUSED') ||
          errorCause.includes('ETIMEDOUT') ||
          errorCause.includes('ENOTFOUND');

        const errorDetail = isConnectionError
          ? `Connection error (${errorCause.includes('ECONNREFUSED') ? 'ECONNREFUSED' : errorCause.includes('ETIMEDOUT') ? 'ETIMEDOUT' : 'network'}): Cannot reach AI provider`
          : errorMsg;

        console.error(`[AgentLoop] ${loopId} iteration ${i} failed: ${errorDetail}`);

        await prisma.agentIteration.update({
          where: { id: iteration.id },
          data: {
            phase: 'error',
            observation: errorDetail,
            durationMs: Date.now() - iterStart,
          },
        });

        // Track consecutive errors for early termination
        consecutiveErrors++;
        lastErrorMessage = errorDetail;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(`[AgentLoop] ${loopId} aborting: ${consecutiveErrors} consecutive errors — ${lastErrorMessage}`);
          finalStatus = 'failed';
          await prisma.agentLoop.update({
            where: { id: loopId },
            data: {
              errorLog: `Aborted after ${consecutiveErrors} consecutive errors: ${lastErrorMessage}`,
              totalIterations: i,
            },
          });
          break;
        }

        // Continue to next iteration on non-fatal errors
        messages.push({
          role: 'user',
          content: `Iteration ${i} encountered an error. Please retry from where you left off. Continue with iteration ${i + 1}.`,
        });
      }
    }


    // Commit to GitHub and open PRs if we have file changes
    if (accumulatedFiles.length > 0 && (finalStatus === 'awaiting_review' || finalStatus === 'completed')) {
      const targetRepo = config.targetRepo || 'deblasioluca/deepterm';
      const baseBranch = config.targetBranch || 'main';

      // Build title from story or loop ID
      let prTitle = 'Agent implementation';
      if (loop.storyId) {
        const story = await prisma.story.findUnique({ where: { id: loop.storyId } });
        if (story) prTitle = story.title;
      }

      // Build description from last iteration's thinking
      const lastIter = await prisma.agentIteration.findFirst({
        where: { loopId },
        orderBy: { iteration: 'desc' },
      });
      const description = lastIter?.thinking?.slice(0, 1000) || 'Implementation by agent loop';

      try {
        const prResult = await commitAndOpenPRs(
          loopId,
          loop.branchName || `agent/${loopId.slice(0, 8)}`,
          accumulatedFiles,
          prTitle,
          description,
          targetRepo,
          baseBranch,
        );

        // Update loop with PR info
        if (prResult.prUrl) {
          await prisma.agentLoop.update({
            where: { id: loopId },
            data: {
              prUrl: prResult.prUrl,
              prNumber: prResult.prNumber,
            },
          });

          // Notify via WhatsApp
          notifyAgentPR({
            loopId,
            repo: targetRepo,
            branch: loop.branchName || `agent/${loopId.slice(0, 8)}`,
            prNumber: prResult.prNumber!,
            prUrl: prResult.prUrl,
            title: prTitle,
            filesChanged: accumulatedFiles.length,
          });
        }

        // Log all PRs if multiple repos were targeted
        if (prResult.allPRs.length > 1) {
          const prSummary = prResult.allPRs.map(p => `${p.repo}: ${p.url}`).join(', ');
          console.log(`[AgentLoop] ${loopId} opened ${prResult.allPRs.length} PRs: ${prSummary}`);
        }
      } catch (err) {
        console.error(`[AgentLoop] ${loopId} failed to create PR:`, err);
        // Don't fail the loop — the code was generated, just PR creation failed
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: { errorLog: (loop.errorLog || '') + `\nPR creation failed: ${err instanceof Error ? err.message : 'Unknown'}` },
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

    // T1-5: Auto-advance lifecycle when agent loop completes with a PR
    if (finalStatus === 'completed' && loop.storyId) {
      try {
        const updatedLoop = await prisma.agentLoop.findUnique({
          where: { id: loopId },
          select: { prNumber: true },
        });
        if (updatedLoop?.prNumber) {
          // Advance story: implement → test
          await prisma.story.update({
            where: { id: loop.storyId },
            data: {
              lifecycleStep: 'test',
              lifecycleStartedAt: new Date(),
              lifecycleHeartbeat: new Date(),
            },
          });
          // Log lifecycle events
          await prisma.lifecycleEvent.create({
            data: { storyId: loop.storyId, stepId: 'implement', event: 'completed', detail: `Agent loop completed — PR #${updatedLoop.prNumber}`, actor: 'system' },
          });
          await prisma.lifecycleEvent.create({
            data: { storyId: loop.storyId, stepId: 'test', event: 'started', detail: 'Auto-advanced after agent loop completion', actor: 'system' },
          });
          console.log(`[AgentLoop] ${loopId} auto-advanced story ${loop.storyId} to test step`);

          // Dispatch CI workflow via lifecycle API (handles dispatch + event logging)
          try {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
            const apiKey = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';
            const ciRes = await fetch(`${baseUrl}/api/admin/cockpit/lifecycle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
              body: JSON.stringify({ action: 'dispatch-ci', storyId: loop.storyId, stepId: 'test' }),
              signal: AbortSignal.timeout(15000),
            });
            if (ciRes.ok) {
              console.log(`[AgentLoop] ${loopId} CI dispatched via lifecycle API for story ${loop.storyId}`);
            } else {
              const errBody = await ciRes.text().catch(() => '');
              console.error(`[AgentLoop] ${loopId} lifecycle CI dispatch failed: ${ciRes.status} ${errBody}`);
            }
          } catch (ciErr) {
            console.error(`[AgentLoop] ${loopId} lifecycle CI dispatch error:`, ciErr);
          }
        }
      } catch (advanceErr) {
        console.error(`[AgentLoop] ${loopId} lifecycle auto-advance failed:`, advanceErr);
      }
    }

    console.log(`[AgentLoop] ${loopId} finished: ${finalStatus} (${accumulatedFiles.length} files committed)`);

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
  feedbackContext?: string;
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
  runAgentLoop(loop.id, params.feedbackContext).catch(err => {
    console.error(`[AgentLoop] Background run failed for ${loop.id}:`, err);
  });

  return loop.id;
}
