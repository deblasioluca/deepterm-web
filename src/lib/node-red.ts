/**
 * lib/node-red.ts
 *
 * Utility to send webhook notifications from the Pi (Next.js) to Node-RED.
 * Node-RED then formats and forwards these as WhatsApp messages.
 *
 * Usage:
 *   import { notifyNodeRed } from '@/lib/node-red';
 *   await notifyNodeRed('triage', { event: 'new-issue', id: '...', title: '...' });
 */

const NODE_RED_BASE_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

type WebhookType = 'triage' | 'build-status' | 'release' | 'payment' | 'idea-popular' | 'security';

interface TriagePayload {
  event: 'new-issue' | 'new-idea';
  id: string;
  title: string;
  description?: string;
  category?: string;
  source?: string;
  authorEmail?: string;
  voteCount?: number;
  url?: string;
}

interface BuildStatusPayload {
  event: 'build-success' | 'build-failure';
  repo?: string;
  branch?: string;
  workflow?: string;
  commitMessage?: string;
  duration?: string;
  failureDetails?: string;
  url?: string;
}

interface ReleasePayload {
  event: 'new-release';
  version: string;
  platform?: string;
  releaseNotes?: string;
  downloadUrl?: string;
}

interface PaymentPayload {
  event: 'payment-success' | 'payment-failed' | 'subscription-created' | 'subscription-cancelled';
  email: string;
  plan?: string;
  amount?: number; // in cents
  details?: string;
}

interface IdeaPopularPayload {
  event: 'idea-popular';
  id: string;
  title: string;
  voteCount: number;
  threshold: number;
  url?: string;
}

interface SecurityPayload {
  event: 'security-alert';
  severity: 'low' | 'medium' | 'high' | 'critical';
  eventType: string;
  sourceIp?: string;
  details?: string;
}

type PayloadMap = {
  triage: TriagePayload;
  'build-status': BuildStatusPayload;
  release: ReleasePayload;
  payment: PaymentPayload;
  'idea-popular': IdeaPopularPayload;
  security: SecurityPayload;
};

/**
 * Send a notification to Node-RED. Fire-and-forget by default.
 * Returns the response if `options.wait` is true.
 */
export async function notifyNodeRed<T extends WebhookType>(
  type: T,
  payload: PayloadMap[T],
  options?: { wait?: boolean; timeoutMs?: number }
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const url = `${NODE_RED_BASE_URL}/deepterm/${type}`;
  const timeout = options?.timeoutMs ?? 5000;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!options?.wait) {
      // Fire-and-forget: we got a response, that's good enough
      return { ok: response.ok, status: response.status };
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, error: text };
    }

    return { ok: true, status: response.status };
  } catch (error) {
    // Don't let Node-RED failures crash the Pi
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[node-red] Failed to notify ${type}: ${message}`);
    return { ok: false, error: message };
  }
}

// ── Convenience wrappers ───────────────────────────────────

export function notifyNewIssue(issue: {
  id: string;
  title: string;
  description?: string;
  area?: string;
  authorEmail?: string;
  source?: string;
}) {
  return notifyNodeRed('triage', {
    event: 'new-issue',
    id: issue.id,
    title: issue.title,
    description: issue.description,
    category: issue.area || 'General',
    source: issue.source || 'app',
    authorEmail: issue.authorEmail,
    url: `https://deepterm.net/admin/issues/${issue.id}`,
  });
}

export function notifyNewIdea(idea: {
  id: string;
  title: string;
  description?: string;
  category?: string;
  authorEmail?: string;
}) {
  return notifyNodeRed('triage', {
    event: 'new-idea',
    id: idea.id,
    title: idea.title,
    description: idea.description,
    category: idea.category || 'feature',
    source: 'website',
    authorEmail: idea.authorEmail,
    url: `https://deepterm.net/admin/feedback`,
  });
}

export function notifyBuildResult(result: BuildStatusPayload) {
  return notifyNodeRed('build-status', result);
}

export function notifyRelease(release: {
  version: string;
  platform?: string;
  releaseNotes?: string;
}) {
  return notifyNodeRed('release', {
    event: 'new-release',
    version: release.version,
    platform: release.platform || 'macOS',
    releaseNotes: release.releaseNotes,
    downloadUrl: `https://deepterm.net/downloads`,
  });
}

export function notifyPayment(payment: PaymentPayload) {
  return notifyNodeRed('payment', payment);
}

export function notifyIdeaPopular(idea: {
  id: string;
  title: string;
  voteCount: number;
  threshold: number;
}) {
  return notifyNodeRed('idea-popular', {
    event: 'idea-popular',
    id: idea.id,
    title: idea.title,
    voteCount: idea.voteCount,
    threshold: idea.threshold,
    url: `https://deepterm.net/admin/feedback`,
  });
}

export function notifySecurityAlert(alert: {
  severity: 'low' | 'medium' | 'high' | 'critical';
  eventType: string;
  sourceIp?: string;
  details?: string;
}) {
  return notifyNodeRed('security', {
    event: 'security-alert',
    ...alert,
  });
}
