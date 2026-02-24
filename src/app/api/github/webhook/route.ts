/**
 * POST /api/github/webhook
 *
 * Receives GitHub webhook events, verifies HMAC-SHA256 signature,
 * stores build results in the database, and forwards notifications
 * to Node-RED → WhatsApp.
 *
 * GitHub events handled:
 *   - workflow_run  → Build status tracking + WhatsApp notification
 *   - push          → Logged for cockpit activity feed
 *   - pull_request  → Logged for cockpit activity feed
 *
 * Env vars required:
 *   GITHUB_WEBHOOK_SECRET  – shared secret configured in GitHub
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { notifyBuildResult } from '@/lib/node-red';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || '';

// ── Signature verification ─────────────────────────────────

function verifySignature(payload: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[GitHub Webhook] GITHUB_WEBHOOK_SECRET not set — skipping verification');
    return true; // Allow in dev; in production, always set the secret
  }

  if (!signature) {
    return false;
  }

  // GitHub sends: sha256=<hex>
  const expected = 'sha256=' + crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(payload, 'utf-8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected),
  );
}

// ── Event handlers ─────────────────────────────────────────

async function handleWorkflowRun(payload: any): Promise<void> {
  const run = payload.workflow_run;
  if (!run) return;

  // Only act on completed runs
  if (run.status !== 'completed') return;

  const conclusion = run.conclusion; // success, failure, cancelled, skipped, etc.
  const repo = payload.repository?.full_name || payload.repository?.name || 'unknown';
  const branch = run.head_branch || 'unknown';
  const workflow = run.name || 'unknown';
  const commitMessage = run.head_commit?.message || '';
  const url = run.html_url || '';
  const runId = String(run.id);

  // Calculate duration
  let duration: string | undefined;
  if (run.run_started_at && run.updated_at) {
    const startMs = new Date(run.run_started_at).getTime();
    const endMs = new Date(run.updated_at).getTime();
    const diffSec = Math.round((endMs - startMs) / 1000);
    const mins = Math.floor(diffSec / 60);
    const secs = diffSec % 60;
    duration = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  }

  // Store in database
  try {
    await prisma.ciBuild.upsert({
      where: { runId },
      update: {
        conclusion,
        duration,
        updatedAt: new Date(),
      },
      create: {
        runId,
        repo,
        branch,
        workflow,
        conclusion,
        commitMessage: commitMessage.slice(0, 500),
        duration,
        url,
        triggeredAt: run.run_started_at ? new Date(run.run_started_at) : new Date(),
      },
    });
  } catch (err) {
    console.error('[GitHub Webhook] DB write failed:', err);
  }

  // Notify Node-RED → WhatsApp
  const isSuccess = conclusion === 'success';
  notifyBuildResult({
    event: isSuccess ? 'build-success' : 'build-failure',
    repo,
    branch,
    workflow,
    commitMessage: commitMessage.split('\n')[0].slice(0, 100),
    duration,
    failureDetails: !isSuccess ? `Conclusion: ${conclusion}` : undefined,
    url,
  });

  console.log(
    `[GitHub Webhook] workflow_run ${workflow} on ${branch}: ${conclusion}` +
    (duration ? ` (${duration})` : '')
  );
}

async function handlePush(payload: any): Promise<void> {
  const repo = payload.repository?.full_name || 'unknown';
  const branch = (payload.ref || '').replace('refs/heads/', '');
  const commits = payload.commits?.length || 0;
  const pusher = payload.pusher?.name || 'unknown';
  const headMessage = payload.head_commit?.message?.split('\n')[0] || '';

  console.log(
    `[GitHub Webhook] push to ${repo}/${branch} by ${pusher}: ` +
    `${commits} commit(s) – "${headMessage}"`
  );

  // Store for activity feed
  try {
    await prisma.githubEvent.create({
      data: {
        eventType: 'push',
        repo,
        branch,
        actor: pusher,
        summary: `${commits} commit(s): ${headMessage.slice(0, 200)}`,
        url: payload.compare || '',
      },
    });
  } catch (err) {
    console.error('[GitHub Webhook] DB write failed:', err);
  }
}

async function handlePullRequest(payload: any): Promise<void> {
  const pr = payload.pull_request;
  if (!pr) return;

  const action = payload.action; // opened, closed, merged, synchronize, etc.
  const repo = payload.repository?.full_name || 'unknown';
  const branch = pr.head?.ref || 'unknown';
  const title = pr.title || '';
  const actor = pr.user?.login || payload.sender?.login || 'unknown';
  const url = pr.html_url || '';
  const merged = pr.merged === true;

  const summary = action === 'closed' && merged
    ? `PR #${pr.number} merged: ${title}`
    : `PR #${pr.number} ${action}: ${title}`;

  console.log(`[GitHub Webhook] pull_request ${action} on ${repo}: ${summary}`);

  // Store for activity feed
  try {
    await prisma.githubEvent.create({
      data: {
        eventType: `pull_request.${action}`,
        repo,
        branch,
        actor,
        summary: summary.slice(0, 500),
        url,
      },
    });
  } catch (err) {
    console.error('[GitHub Webhook] DB write failed:', err);
  }
}

// ── Main handler ───────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();

  // Verify signature
  const signature = request.headers.get('x-hub-signature-256');
  if (!verifySignature(body, signature)) {
    console.warn('[GitHub Webhook] Invalid signature');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = request.headers.get('x-github-event');
  const deliveryId = request.headers.get('x-github-delivery');

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  console.log(`[GitHub Webhook] Received event=${event} delivery=${deliveryId}`);

  try {
    switch (event) {
      case 'workflow_run':
        await handleWorkflowRun(payload);
        break;
      case 'push':
        await handlePush(payload);
        break;
      case 'pull_request':
        await handlePullRequest(payload);
        break;
      case 'ping':
        console.log('[GitHub Webhook] Ping received — webhook is active');
        break;
      default:
        console.log(`[GitHub Webhook] Ignoring event: ${event}`);
    }
  } catch (err) {
    console.error(`[GitHub Webhook] Error processing ${event}:`, err);
    // Return 200 anyway so GitHub doesn't retry
  }

  return NextResponse.json({ received: true, event });
}
