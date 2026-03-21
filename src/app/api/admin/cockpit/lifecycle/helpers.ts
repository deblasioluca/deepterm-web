/**
 * Lifecycle route helpers — extracted from route.ts to reduce file size.
 *
 * Contains: CI/GitHub integration, event logging, step duration tracking,
 * ETA estimates, post-merge epic checks, stale loop recovery, version bumping,
 * and Node-RED loop-back notifications.
 */

import { prisma } from '@/lib/prisma';

// ── Constants ──────────────────────────────────────────────

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const CI_REPO = 'deblasioluca/deepterm';

/** Step ordering for reset-to-step logic */
export const STEP_ORDER = ['triage', 'plan', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];

/** Step timeout defaults (seconds) — null means human-gated, no timeout */
export const STEP_TIMEOUTS: Record<string, number | null> = {
  triage: null,
  plan: null,
  deliberation: 300,
  implement: 600,
  test: 1200,
  review: null,
  deploy: 600,
  release: 120,
};

/** Per-suite timeouts for the Test step (seconds) */
export const SUITE_TIMEOUTS = {
  build: 300,
  unit: 300,
  ui: 600,
  e2e: 300,
};

/** Lifecycle template step definitions */
export const LIFECYCLE_TEMPLATES: Record<string, string[]> = {
  full: ['triage', 'plan', 'deliberation', 'implement', 'test', 'review'],
  quick_fix: ['triage', 'implement', 'test', 'review'],
  hotfix: ['implement', 'test', 'review'],
  web_only: ['triage', 'plan', 'implement', 'test', 'review'],
};

// ── CI runner status (cached 60s) ──────────────────────────

let cachedRunnerStatus: { status: string; name: string; busy: boolean; labels: string[]; checkedAt: string } | null = null;
let runnerCacheExpiry = 0;

export async function getCIRunnerStatus() {
  const now = Date.now();
  if (cachedRunnerStatus && now < runnerCacheExpiry) return cachedRunnerStatus;
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${CI_REPO}/actions/runners`, {
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cachedRunnerStatus;
    const data = await res.json();
    const runners = data.runners || [];
    const mac = runners.find((r: { labels: { name: string }[] }) => r.labels?.some((l: { name: string }) => l.name === 'self-hosted-mac')) || runners[0];
    if (mac) {
      cachedRunnerStatus = {
        status: mac.status,
        name: mac.name,
        busy: mac.busy || false,
        labels: (mac.labels || []).map((l: { name: string }) => l.name),
        checkedAt: new Date().toISOString(),
      };
    } else {
      cachedRunnerStatus = { status: 'not_found', name: 'ci-mac', busy: false, labels: [], checkedAt: new Date().toISOString() };
    }
    runnerCacheExpiry = now + 60000;
    return cachedRunnerStatus;
  } catch {
    return cachedRunnerStatus;
  }
}

// ── CI workflow dispatch ───────────────────────────────────

export async function dispatchCIWorkflow(storyId: string, branch: string = 'main') {
  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not configured — cannot dispatch CI workflow');
    return { ok: false, error: 'GITHUB_TOKEN not configured' };
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${CI_REPO}/actions/workflows/pr-check.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: branch,
          inputs: { story_id: storyId },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );
    if (res.status === 204) {
      console.log(`CI workflow dispatched for story ${storyId}`);
      return { ok: true };
    }
    const body = await res.text();
    console.error(`CI dispatch failed: ${res.status} ${body}`);
    return { ok: false, error: `GitHub returned ${res.status}` };
  } catch (e) {
    console.error('CI dispatch error:', e);
    return { ok: false, error: String(e) };
  }
}

// ── Node-RED loop-back webhook ─────────────────────────────

export async function notifyLoopBack(storyId: string, storyTitle: string, fromStep: string, toStep: string, reason: string, loopCount: number, maxLoops: number) {
  try {
    await fetch(`${NODE_RED_URL}/deepterm/lifecycle-loop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'lifecycle-loop', storyId, storyTitle, fromStep, toStep, reason, loopCount, maxLoops }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (e) {
    console.error('Node-RED lifecycle-loop webhook failed:', e);
  }
}

// ── Event logging ──────────────────────────────────────────

export async function logEvent(storyId: string, stepId: string, event: string, detail?: string, actor?: string) {
  return prisma.lifecycleEvent.create({
    data: { storyId, stepId, event, detail, actor: actor || 'system' },
  });
}

// ── Step duration tracking ─────────────────────────────────

export async function recordStepDuration(storyId: string, stepId: string, durationSeconds: number) {
  try {
    await prisma.stepDurationHistory.create({
      data: { storyId, stepId, duration: durationSeconds },
    });
  } catch (e) {
    console.error('Failed to record step duration:', e);
  }
}

// ── ETA estimates from historical durations ────────────────

export async function getStepETAs(): Promise<Record<string, { p50: number; p90: number; count: number }>> {
  const histories = await prisma.stepDurationHistory.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  const byStep: Record<string, number[]> = {};
  for (const h of histories) {
    if (!byStep[h.stepId]) byStep[h.stepId] = [];
    byStep[h.stepId].push(h.duration);
  }
  const etas: Record<string, { p50: number; p90: number; count: number }> = {};
  for (const [stepId, durations] of Object.entries(byStep)) {
    if (durations.length < 3) continue;
    const sorted = [...durations].sort((a, b) => a - b);
    etas[stepId] = {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      count: sorted.length,
    };
  }
  return etas;
}

// ── Post-merge epic gate check ─────────────────────────────

export async function doPostMergeEpicCheck(storyId: string) {
  const s = await prisma.story.findUnique({ where: { id: storyId }, select: { epicId: true } });
  if (!s?.epicId) return;
  const siblings = await prisma.story.findMany({
    where: { epicId: s.epicId, id: { not: storyId } },
    select: { id: true, lifecycleStep: true, mergedAt: true, status: true },
  });
  const pendingCount = siblings.filter(sib =>
    sib.mergedAt == null &&
    sib.status !== 'released' &&
    !['merged', 'deploy', 'release'].includes(sib.lifecycleStep ?? '')
  ).length;
  if (pendingCount > 0) {
    const word = pendingCount === 1 ? 'story' : 'stories';
    await logEvent(storyId, 'review', 'progress', JSON.stringify({
      message: `Story merged — waiting for ${pendingCount} sibling ${word} before epic deploy`,
      waitingForSiblings: true, pendingCount,
    }), 'system');
  } else {
    await prisma.epic.update({
      where: { id: s.epicId },
      data: { epicLifecycleStep: 'deploy', epicDeployStarted: new Date() },
    });
    await logEvent(storyId, 'review', 'progress', JSON.stringify({
      message: 'All epic stories merged — epic deploy gate opened',
      epicDeployOpened: true,
    }), 'system');
  }
}

// ── Xcode version bump via GitHub API ──────────────────────

export async function bumpVersionInXcode(releaseType: 'minor' | 'major'): Promise<{ ok: boolean; newVersion?: string; error?: string }> {
  const SWIFT_REPO = 'deblasioluca/deepterm';
  const PBXPROJ_PATH = 'DeepTerm.xcodeproj/project.pbxproj';
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: 'GITHUB_TOKEN not set' };
  try {
    const getRes = await fetch(`https://api.github.com/repos/${SWIFT_REPO}/contents/${PBXPROJ_PATH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!getRes.ok) return { ok: false, error: `GitHub get failed: ${getRes.status}` };
    const fileData = await getRes.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf8');
    const sha = fileData.sha;
    const match = content.match(/MARKETING_VERSION = ([\d.]+);/);
    if (!match) return { ok: false, error: 'MARKETING_VERSION not found in pbxproj' };
    const parts = match[1].split('.').map(Number);
    const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    const newVersion = releaseType === 'major' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
    const updated = content.replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${newVersion};`);
    const putRes = await fetch(`https://api.github.com/repos/${SWIFT_REPO}/contents/${PBXPROJ_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        message: `chore: bump version to ${newVersion} (${releaseType} release)`,
        content: Buffer.from(updated).toString('base64'),
        sha,
      }),
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      return { ok: false, error: `GitHub put failed: ${putRes.status} ${JSON.stringify(err)}` };
    }
    return { ok: true, newVersion };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Stale loop recovery ────────────────────────────────────

export async function recoverStaleLoops() {
  const STALE_THRESHOLD_MS = 5 * 60 * 1000;
  const staleLoops = await prisma.agentLoop.findMany({
    where: {
      status: { in: ['running', 'queued'] },
      updatedAt: { lt: new Date(Date.now() - STALE_THRESHOLD_MS) },
    },
    select: { id: true, storyId: true },
  });
  for (const loop of staleLoops) {
    await prisma.agentLoop.update({
      where: { id: loop.id },
      data: { status: 'failed' },
    });
    if (loop.storyId) {
      await logEvent(
        loop.storyId,
        'implement',
        'failed',
        JSON.stringify({ message: `AgentLoop ${loop.id} marked failed — stale (no update for 5+ min, likely killed by PM2 restart)` }),
        'system',
      );
    }
    console.warn(`[StaleLoopRecovery] Marked loop ${loop.id} as failed (stale)`);

    if (loop.storyId) {
      try {
        const baseUrl = process.env.INTERNAL_API_URL || 'http://localhost:3000';
        const apiKey = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';
        const retryRes = await fetch(`${baseUrl}/api/admin/cockpit/lifecycle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
          body: JSON.stringify({
            action: 'retry-step',
            storyId: loop.storyId,
            stepId: 'implement',
            reason: `Auto-retry after stale loop ${loop.id} was recovered`,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (retryRes.ok) {
          console.log(`[StaleLoopRecovery] Auto-triggered retry-step for story ${loop.storyId}`);
        } else {
          console.error(`[StaleLoopRecovery] retry-step failed: ${retryRes.status}`);
        }
      } catch (retryErr) {
        console.error(`[StaleLoopRecovery] retry-step error:`, retryErr);
      }
    }
  }
}
