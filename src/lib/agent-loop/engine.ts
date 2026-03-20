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
const MAX_CONTEXT_CHARS = 400_000; // Max chars for conversation context
const MAX_CONSECUTIVE_ERRORS = 3; // Stop early after this many consecutive errors
// Graceful shutdown: mark running loops as failed when PM2 restarts
let _shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (_shuttingDown) return;
  _shuttingDown = true;
  console.warn(`[AgentLoop] ${signal} received -- marking running loops as failed`);
  try {
    const { PrismaClient } = await import('@prisma/client');
    const _p = new PrismaClient();
    await _p.agentLoop.updateMany({
      where: { status: { in: ['running', 'queued'] } },
      data: { status: 'failed', errorLog: `Process received ${signal}` },
    });
    await _p.$disconnect();
  } catch (e) { console.error('[AgentLoop] Shutdown cleanup error:', e); }
  process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', (err) => console.error('[AgentLoop] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[AgentLoop] Unhandled rejection:', reason));

const BUILD_GATE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min max wait for build gate
const BUILD_GATE_POLL_MS = 15_000;             // Poll every 15s
const MAX_BUILD_GATE_ATTEMPTS = 3;             // Max fix-and-retry cycles before giving up
// Local logEvent helper (mirrors lifecycle/route.ts)
async function logEvent(storyId: string, stepId: string, event: string, detail?: string, actor?: string) {
  try {
    await prisma.lifecycleEvent.create({ data: { storyId, stepId, event, detail, actor: actor || 'system' } });
  } catch { /* non-fatal */ }
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ── Build Gate ────────────────────────────────────────────────────────────────
// Verifies agent code compiles and new tests pass on CI Mac BEFORE opening a PR.

function extractNewTestTargets(files: AccumulatedFile[]): string[] {
  const targets: string[] = [];
  for (const f of files) {
    if (f.action === 'delete') continue;
    const u = f.path.match(/DeepTermTests\/(?:.+\/)?([A-Za-z0-9_]+Tests)\.swift$/);
    if (u) targets.push(`DeepTermTests/${u[1]}`);
    const ui = f.path.match(/DeepTermUITests\/(?:.+\/)?([A-Za-z0-9_]+)\.swift$/);
    if (ui) targets.push(`DeepTermUITests/${ui[1]}`);
  }
  return Array.from(new Set(targets));
}

async function runBuildGate(params: {
  loopId: string; storyId: string; branch: string; testTargets: string[];
  baseUrl: string; apiKey: string; githubToken: string; repo: string;
}): Promise<{ passed: boolean; detail: string }> {
  const { loopId, storyId, branch, testTargets, baseUrl, apiKey, githubToken, repo } = params;
  const dispatchRes = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/build-gate.yml/dispatches`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${githubToken}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ ref: branch, inputs: { story_id: storyId, loop_id: loopId, test_targets: testTargets.join(' ') } }),
      signal: AbortSignal.timeout(15000),
    }
  );
  if (!dispatchRes.ok) {
    const txt = await dispatchRes.text();
    return { passed: false, detail: `Build gate dispatch failed (${dispatchRes.status}): ${txt.slice(0, 200)}` };
  }
  console.log(`[BuildGate] ${loopId} dispatched on ${branch}, polling...`);
  const dispatchedAt = new Date().toISOString();
  const deadline = Date.now() + BUILD_GATE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await delay(BUILD_GATE_POLL_MS);
    try {
      const res = await fetch(
        `${baseUrl}/api/admin/cockpit/lifecycle/events?storyId=${storyId}&stepId=implement&limit=30`,
        { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) continue;
      const data = await res.json() as { events: Array<{ event: string; detail: string | null; createdAt: string }> };
      const hits = (data.events || []).filter(
        e => (e.event === 'build-gate-pass' || e.event === 'build-gate-fail') && e.createdAt >= dispatchedAt
      );
      if (hits.length > 0) {
        const latest = hits[hits.length - 1];
        return { passed: latest.event === 'build-gate-pass', detail: latest.detail || '{}' };
      }
    } catch { /* continue polling */ }
  }
  return { passed: false, detail: JSON.stringify({ message: 'Build gate timed out after 10 minutes' }) };
}

function formatBuildGateFailure(detail: string): string {
  try {
    const d = JSON.parse(detail) as { buildResult?: string; buildErrors?: string[]; testResult?: string; failedTests?: string[]; message?: string };
    const lines: string[] = ['## Build Gate Failed — fix the following issues:\n'];
    if (d.buildResult === 'failed') {
      lines.push('### Compiler Errors');
      (d.buildErrors || ['Build failed']).forEach(e => lines.push(`- ${e}`));
    }
    if (d.testResult === 'failed') {
      lines.push('\n### Failed Tests');
      (d.failedTests || ['Tests failed']).forEach(t => lines.push(`- ${t}`));
    }
    if (d.message && !d.buildResult) lines.push(d.message);
    return lines.join('\n');
  } catch { return `Build gate failed: ${detail}`; }
}

// ── Context Building ─────────────────────────────


// ── Target File Detection & Fetching (Issue #7/8 fix) ────────────────────────

function extractFileKeywords(title: string, description: string): string[] {
  const combined = (title + " " + description).toLowerCase();
  const combinedRaw = title + " " + description; // preserve case for CamelCase matching
  const explicitFiles: string[] = [];

  // Match explicit filenames WITH .swift extension (highest confidence)
  const reWithExt = /([a-z][a-z0-9]+(?:view|controller|manager|service|model|store|helper|cell|row|button|panel|sheet))\.swift/gi;
  let mm: RegExpExecArray | null;
  while ((mm = reWithExt.exec(combined)) !== null) explicitFiles.push(mm[1].toLowerCase());

  // Also match CamelCase type names WITHOUT .swift extension (e.g. "ConnectionsView" in title)
  const reCamel = /\b([A-Z][a-zA-Z0-9]+(?:View|Controller|Manager|Service|Model|Store|Helper|Cell|Row|Button|Panel|Sheet|Tab|List|Detail|Item))\b/g;
  let mc: RegExpExecArray | null;
  while ((mc = reCamel.exec(combinedRaw)) !== null) {
    const name = mc[1].toLowerCase();
    if (!explicitFiles.includes(name)) explicitFiles.push(name);
  }

  const titleWords = title.toLowerCase().split(/\s+/);
  const viewKws = titleWords.filter(w =>
    w.length > 3 &&
    !["show","add","with","from","into","when","that","this","each","last","list",
      "the","and","for","not","has","are","new","any","button","toolbar"].includes(w)
  );
  const domainMap: Record<string, string[]> = {
    host:["host","connection","session"], hosts:["host","connection"],
    connection:["connection","session","host"], connections:["connection","session","host"],
    disconnect:["connection","session","toolbar"], toolbar:["toolbar","mainwindow","window"],
    settings:["settingsview","preferencesview","general"], preferences:["preferencesview","settingsview","general"],
    search:["search","filter"], empty:["empty","placeholder"],
    timestamp:["host","connection","row"], badge:["host","connection","row"],
    latency:["host","connection","row"], ping:["host","connection"],
    tooltip:["toolbar","button","mainwindow"], clipboard:["connection","host","detail"],
    version:["preferences","general","about","settings"], command:["command","palette"],
    palette:["command","palette"], shortcut:["shortcut","command","keyboard"],
    // Extended domain mappings
    fingerprint:["hostdetailview","hostinfoview","connectiondetailview","hostinfopanel"],
    detail:["hostdetailview","hostinfoview","connectiondetailview"],
    details:["hostdetailview","connectiondetailview","hostinfoview"],
    panel:["hostdetailview","hostinfoview","connectiondetailview","hostinfoPanel"],
    info:["hostinfoview","hostdetailview","connectiondetailview"],
    port:["host","connection","hostdetailview"], username:["host","credential","authview"],
    key:["credential","biometrickeystore","authview"], vault:["vault","zkservice","biometrickeystore"],
    sync:["syncengine","syncscheduler","syncentity"], credential:["credentialstore","authview"],
    sidebar:["sidebarsection","connectionssidebar","groupssidebar"],
    group:["group","groupsview","connectiongroup"], icon:["host","connection","iconview"],
    menu:["mainmenu","contextmenu","toolbar"], status:["statusbar","connectionstatus"],
  };
  const mapped: string[] = [];
  for (const word of titleWords) { const hits = domainMap[word]; if (hits) mapped.push(...hits); }
  return Array.from(new Set([...explicitFiles, ...viewKws, ...mapped])).slice(0, 10);
}

function extractExcludedFiles(description: string): string[] {
  const excluded: string[] = [];
  const pats: RegExp[] = [
    /do not modify\s+([A-Za-z0-9./]+\.swift)/gi,
    /not modify\s+([A-Za-z0-9./]+\.swift)/gi,
    /avoid\s+([A-Za-z0-9./]+\.swift)/gi,
  ];
  for (const pat of pats) {
    let mm2: RegExpExecArray | null;
    while ((mm2 = pat.exec(description)) !== null) {
      excluded.push((mm2[1].toLowerCase().split("/").pop() || mm2[1]));
    }
  }
  return excluded;
}

function matchTargetFiles(
  keywords: string[], excludedFiles: string[], repoTree: string, maxFiles = 5,
): string[] {
  const swiftFiles = repoTree.split("\n").filter(line =>
    line.endsWith(".swift") && line.includes("Sources/") &&
    !line.includes(".swift-version") && !line.includes("AppSettings.swift") && !line.includes("/Preview ") && !line.includes("Generated") && !line.includes(".build/")
  ).map(l => l.trim().replace(/^[|\-\s]+/, ""));
  const scored: Array<{ path: string; score: number }> = [];
  for (const fp of swiftFiles) {
    const fn = (fp.toLowerCase().split("/").pop() || "").replace(".swift", "");
    if (excludedFiles.some(ex => fn.includes(ex.replace(".swift", "")))) continue;
    let score = 0;
    for (const kw of keywords) {
      // Exact filename match (from explicit file extraction) → highest priority
      if (fn === kw) score += 10;
      else if (fn.includes(kw)) score += 3;
      else if (fp.toLowerCase().includes(kw)) score += 1;
    }
    if (score > 0) scored.push({ path: fp, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, maxFiles).map(s => s.path);
}

async function fetchTargetFileContents(
  paths: string[], repo: string, branch: string, token: string,
): Promise<Array<{ path: string; content: string }>> {
  const MAX_LINES = 150;
  const results: Array<{ path: string; content: string }> = [];
  for (const fp of paths) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${repo}/contents/${fp}?ref=${branch}`,
        { signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github.raw+json" } }
      );
      if (!res.ok) continue;
      const raw = await res.text();
      const lines = raw.split("\n");
      const truncated = lines.length > MAX_LINES
        ? lines.slice(0, MAX_LINES).join("\n") + `\n// ... (${lines.length - MAX_LINES} more lines truncated)`
        : raw;
      results.push({ path: fp, content: truncated });
    } catch { /* skip */ }
  }
  return results;
}
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


  // ── Inject target file contents (Issue #7/8 fix) ──
  if (loop.storyId) {
    const storyForFiles = await prisma.story.findUnique({
      where: { id: loop.storyId },
      select: { title: true, description: true },
    });
    if (storyForFiles) {
      const ghTok = process.env.GITHUB_TOKEN;
      if (ghTok && repoCtx) {
        const kws = extractFileKeywords(storyForFiles.title, storyForFiles.description);
        const excl = extractExcludedFiles(storyForFiles.description);
        const tPaths = matchTargetFiles(kws, excl, repoCtx, 5);
        if (tPaths.length > 0) {
          const fileContents = await fetchTargetFileContents(tPaths, "deblasioluca/deepterm", "main", ghTok);
          if (fileContents.length > 0) {
            const fileSection = fileContents
              .map(f => `### ${f.path}\n\`\`\`swift\n${f.content}\n\`\`\``)
              .join("\n\n");
            parts.push(
              `## Existing File Contents — READ BEFORE MODIFYING\n` +
              `**CRITICAL: These are the CURRENT file contents. Make MINIMAL targeted changes. ` +
              `Do NOT rewrite the entire file. Find the exact insertion point and add only what is needed.**\n\n` +
              fileSection
            );
            console.log(`[TaskContext] Injected ${fileContents.length} target files: ${fileContents.map(f => f.path.split("/").pop()).join(", ")}`);
          }
        }
      }
    }
  }


  // ── Inject target file contents (Issue #7/8 fix) ──
  if (loop.storyId) {
    const storyForFiles = await prisma.story.findUnique({
      where: { id: loop.storyId },
      select: { title: true, description: true },
    });
    if (storyForFiles) {
      const ghTok = process.env.GITHUB_TOKEN;
      if (ghTok && repoCtx) {
        const kws = extractFileKeywords(storyForFiles.title, storyForFiles.description);
        const excl = extractExcludedFiles(storyForFiles.description);
        const tPaths = matchTargetFiles(kws, excl, repoCtx, 5);
        if (tPaths.length > 0) {
          const fileContents = await fetchTargetFileContents(tPaths, "deblasioluca/deepterm", "main", ghTok);
          if (fileContents.length > 0) {
            const fileSection = fileContents
              .map(f => `### ${f.path}\n\`\`\`swift\n${f.content}\n\`\`\``)
              .join("\n\n");
            parts.push(
              `## Existing File Contents — READ BEFORE MODIFYING\n` +
              `**CRITICAL: These are the CURRENT file contents. Make MINIMAL targeted changes. ` +
              `Do NOT rewrite the entire file. Find the exact insertion point and add only what is needed.**\n\n` +
              fileSection
            );
            console.log(`[TaskContext] Injected ${fileContents.length} target files: ${fileContents.map(f => f.path.split("/").pop()).join(", ")}`);
          }
        }
      }
    }
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
- **MINIMAL CHANGES ONLY**: Always prefer the smallest possible change. Never rewrite an entire file when you can add 2-5 lines.
- If "Existing File Contents" are provided above, you MUST base your changes on those exact contents. Do not reconstruct or rewrite.
- **NEVER use @EnvironmentObject** unless the existing code already uses it for that type. Check the existing file first.
- **ALWAYS check existing class/struct signatures** before modifying initializers or adding properties.
- **BRACE BALANCING**: After every code insertion into an existing Swift file, count { and } in the ENTIRE modified block (function, computed property, or view body). They must match exactly. Common failure: inserting a new view after Spacer() or after the last item in a VStack/Section, without preserving the closing brace of that block.
- **Swift insertion pattern — MANDATORY**: To add code inside a VStack/Form/Section/body, you MUST insert BEFORE the closing brace of that block, and that closing brace MUST appear on the next line after your new code. Never insert code AFTER a closing brace.
- **Insertion example (correct)** — insert new code BEFORE the closing brace of the block:
  BEFORE: Section { Toggle(...) / Spacer() / closing-brace }
  AFTER:  Section { Toggle(...) / Spacer() / Text("Version: x") / closing-brace }
  The closing brace after your new line is PRESERVED — never deleted or moved.
- **Self-check before DONE**: Count opening and closing braces in every modified computed property or function body. If they do not match, fix before setting DONE.
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
  // Hard cap: entire loop must complete within 15 minutes
  const LOOP_DEADLINE = Date.now() + 15 * 60 * 1000;
  const loopDeadlineError = new Error(`[AgentLoop] ${loopId} exceeded 15-minute total deadline`);

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
        // Context pressure: summarize old iterations before hard-trimming
        {
          const ctxText = messages.map((m: {role:string,content:unknown}) => typeof m.content === 'string' ? m.content : '').join('\n');
          const pressure = ctxText.length / MAX_CONTEXT_CHARS;
          if (pressure > 0.6 && messages.length > 6) {
            const toSum = messages.slice(2, messages.length - 4);
            const sumPrompt = 'Summarize these agent iterations in <=300 words, preserving key decisions and file changes:\n' + toSum.map((m: {role:string,content:unknown}) => m.role + ': ' + String(m.content).slice(0, 400)).join('\n---\n');
            try {
              const sumResp = await callAI('agent-loop.summarize', 'You are a concise technical summarizer.', [{ role: 'user', content: sumPrompt }], { maxTokens: 400 });
              const sumText = typeof sumResp.content === 'string' ? sumResp.content : (sumResp.content as Array<{type:string,text?:string}>).filter((b: {type:string,text?:string}) => b.type === 'text').map((b: {type:string,text?:string}) => b.text || '').join('');
              messages.splice(2, toSum.length, { role: 'assistant', content: '[Context summary — ' + toSum.length + ' iterations compressed]:\n' + sumText });
            } catch { /* summarization failed — fall through to hard trim */ }
          }
          // Hard trim fallback
          let trimText = messages.map((m: {role:string,content:unknown}) => typeof m.content === 'string' ? m.content : '').join('\n');
          while (trimText.length > MAX_CONTEXT_CHARS && messages.length > 4) {
            messages.splice(1, 2);
            trimText = messages.map((m: {role:string,content:unknown}) => typeof m.content === 'string' ? m.content : '').join('\n');
          }
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
            // ── Checkpoint: snapshot of accumulated files + context summary after each iteration ──
            filesSnapshot: JSON.stringify(accumulatedFiles),
            contextSummary: `Iter ${i}/${maxIter}: ${accumulatedFiles.length} files accumulated. ${(parsed.observation || '').slice(0, 200)}`,
            isCheckpoint: true,
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
        const isContextOverflow = (errorMsg.toLowerCase().includes('context') && errorMsg.toLowerCase().includes('length')) ||
          errorMsg.toLowerCase().includes('too many tokens') ||
          errorMsg.toLowerCase().includes('input is too long');
        const isRateLimit = errorMsg.includes('429') ||
          errorMsg.toLowerCase().includes('overloaded') ||
          errorMsg.toLowerCase().includes('rate limit') ||
          errorMsg.toLowerCase().includes('rate_limit');
        const errorType = isContextOverflow ? 'context_overflow' : isRateLimit ? 'rate_limit' : isConnectionError ? 'connection' : 'api_error';

        // Rate limit: exponential backoff, do NOT count as consecutive error
        if (isRateLimit) {
          const backoffMs = Math.min(10_000 * Math.pow(2, consecutiveErrors), 120_000);
          console.warn(`[AgentLoop] ${loopId} rate-limited — backing off ${backoffMs}ms`);
          await delay(backoffMs);
        }

        const errorDetail = isContextOverflow
          ? 'Context length exceeded — conversation compressed and retrying'
          : isRateLimit
          ? 'Rate limited — retrying after backoff'
          : isConnectionError
          ? 'Connection error (' + (errorCause.includes('ECONNREFUSED') ? 'ECONNREFUSED' : errorCause.includes('ETIMEDOUT') ? 'ETIMEDOUT' : 'ENOTFOUND') + ')'
          : errorMsg;

        console.error(`[AgentLoop] ${loopId} iteration ${i} ${errorType}: ${errorDetail}`);

        await prisma.agentIteration.update({
          where: { id: iteration.id },
          data: {
            phase: 'error',
            observation: errorDetail,
            durationMs: Date.now() - iterStart,
            errorType,
          },
        });

        // Rate limits don't count as logic failures
        if (!isRateLimit) consecutiveErrors++;
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


    // ── Build Gate → Commit to GitHub → Open PR ────────────────────────────────
    // Before creating a PR: push to a temp verify branch, run build-gate.yml on
    // CI Mac, wait for result. If pass: commit to agent branch + PR.
    // If fail: inject compiler errors back into agent loop, fix up to 3 times.
    if (accumulatedFiles.length > 0 && (finalStatus === 'awaiting_review' || finalStatus === 'completed')) {
      const targetRepo = config.targetRepo || 'deblasioluca/deepterm';
      const baseBranch = config.targetBranch || 'main';
      const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
      const apiKey = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';
      const githubToken = process.env.GITHUB_TOKEN || '';
      const hasSwiftChanges = accumulatedFiles.some(
        f => f.path.endsWith('.swift') || f.path.includes('.xcodeproj') || f.path.endsWith('.plist')
      );
      const newTestTargets = extractNewTestTargets(accumulatedFiles);
      let buildGatePassed = true; // assume OK for non-Swift or no token

      if (hasSwiftChanges && githubToken && loop.storyId) {
        const verifyBranch = `build-gate/${loopId.slice(0, 8)}`;
        let verifyPushed = false;
        try {
          await commitFiles(targetRepo, verifyBranch, baseBranch, accumulatedFiles,
            `build-gate: verify implementation (loop ${loopId})`);
          verifyPushed = true;
        } catch (err) {
          console.error(`[AgentLoop] ${loopId} verify branch push failed — treating as build-gate-fail:`, err);
          if (loop.storyId) {
            await logEvent(loop.storyId, "implement", "build-gate-fail",
              JSON.stringify({ message: "Build gate skipped — branch push failed", error: String(err), loopId }), "system");
          }
          finalStatus = "failed";
          buildGatePassed = false;
        }

        if (verifyPushed) {
          buildGatePassed = false;
          let gateAttempt = 0;
          while (gateAttempt < MAX_BUILD_GATE_ATTEMPTS) {
            gateAttempt++;
            await logEvent(loop.storyId, 'implement', 'progress',
              JSON.stringify({ message: `Build gate (attempt ${gateAttempt}/${MAX_BUILD_GATE_ATTEMPTS})…`, loopId }), 'system');

            const gate = await runBuildGate({
              loopId, storyId: loop.storyId, branch: verifyBranch,
              testTargets: newTestTargets, baseUrl, apiKey, githubToken, repo: targetRepo,
            });

            if (gate.passed) {
              buildGatePassed = true;
              await logEvent(loop.storyId, 'implement', 'build-gate-pass',
                JSON.stringify({ message: `Build gate passed (attempt ${gateAttempt})`, loopId }), 'system');
              break;
            }

            // Failed
            if (gateAttempt >= MAX_BUILD_GATE_ATTEMPTS) {
              finalStatus = 'failed';
              await prisma.agentLoop.update({ where: { id: loopId },
                data: { errorLog: `Build gate failed after ${MAX_BUILD_GATE_ATTEMPTS} attempts. Last detail: ${gate.detail}` } });
              await logEvent(loop.storyId, 'implement', 'build-gate-fail',
                JSON.stringify({ message: `Build gate gave up after ${MAX_BUILD_GATE_ATTEMPTS} attempts`, loopId }), 'system');
              break;
            }

            // Inject errors → agent fixes → re-push
            const errMsg = formatBuildGateFailure(gate.detail);
            messages.push({ role: 'user', content: `${errMsg}\n\nFix all issues above. Set status to DONE when resolved.` });
            for (let fi = 1; fi <= 2; fi++) { // max 2 self-correction attempts (2 x 3min = 6min cap)
              if (Date.now() > LOOP_DEADLINE) { console.warn(`[AgentLoop] ${loopId} deadline exceeded in fix loop — aborting`); finalStatus = 'failed'; break; }
              const fr = await callAI(
                'agent-loop.implement',
                getSystemPrompt({ requireTests: config.requireTests ?? true, requireBuild: config.requireBuild ?? true }),
                messages,
                { maxTokens: 8192 }
              );
              const fixedFiles = parseFileChanges(fr.content);
              const fpStatus = parseIterationResponse(fr.content).status;
              if (fixedFiles.length > 0) accumulatedFiles = mergeFileChanges(accumulatedFiles, fixedFiles);
              messages.push({ role: 'assistant', content: fr.content });
              if (fpStatus === 'done') break;
              if (fpStatus === 'blocked') { finalStatus = 'failed'; break; }
              messages.push({ role: 'user', content: `Fix iteration ${fi} recorded. Continue.` });
              await delay(ITERATION_DELAY_MS);
            }
            if (finalStatus === 'failed') break;
            try {
              await commitFiles(targetRepo, verifyBranch, baseBranch, accumulatedFiles,
                `build-gate: fix ${gateAttempt} (loop ${loopId})`);
            } catch (err) {
              console.warn(`[AgentLoop] ${loopId} re-push failed:`, err);
              finalStatus = 'failed'; break;
            }
          }
          // Clean up verify branch
          fetch(`https://api.github.com/repos/${targetRepo}/git/refs/heads/${verifyBranch}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' },
          }).catch(() => {/* best effort */});
        }
      }

      if (!buildGatePassed) {
        console.log(`[AgentLoop] ${loopId} skipping PR — build gate failed`);
        // Auto-trigger retry-step implement so a fresh AgentLoop starts with error context
        if (loop.storyId) {
          try {
            const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
            const apiKey = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';
            const lastErrorLog = await prisma.agentLoop.findUnique({
              where: { id: loopId }, select: { errorLog: true },
            });
            const retryRes = await fetch(`${baseUrl}/api/admin/cockpit/lifecycle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
              body: JSON.stringify({
                action: 'retry-step',
                storyId: loop.storyId,
                stepId: 'implement',
                reason: `Auto-retry after build gate failed ${MAX_BUILD_GATE_ATTEMPTS} times. Last error: ${lastErrorLog?.errorLog?.slice(0, 500) ?? 'unknown'}`,
              }),
              signal: AbortSignal.timeout(15000),
            });
            if (retryRes.ok) {
              console.log(`[AgentLoop] ${loopId} auto-triggered retry-step implement for story ${loop.storyId}`);
              await logEvent(loop.storyId, 'implement', 'progress',
                JSON.stringify({ message: `Auto-retry triggered after ${MAX_BUILD_GATE_ATTEMPTS} failed build gate attempts`, loopId }), 'system');
            } else {
              const errBody = await retryRes.text().catch(() => '');
              console.error(`[AgentLoop] ${loopId} auto retry-step failed: ${retryRes.status} ${errBody}`);
            }
          } catch (retryErr) {
            console.error(`[AgentLoop] ${loopId} auto retry-step error:`, retryErr);
          }
        }
      } else {


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
      // PR created successfully — mark loop as completed for auto-advance
      finalStatus = 'completed';

      } catch (err) {
        console.error(`[AgentLoop] ${loopId} failed to create PR:`, err);
        // Don't fail the loop — the code was generated, just PR creation failed
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: { errorLog: (loop.errorLog || '') + `\nPR creation failed: ${err instanceof Error ? err.message : 'Unknown'}` },
        });
      }
      } // end else (buildGatePassed)
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
    if ((finalStatus === 'completed' || finalStatus === 'awaiting_review') && loop.storyId) {
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
