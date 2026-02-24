/**
 * Intrusion Detection & Alerting
 *
 * In-memory sliding-window tracker that triggers email alerts to the admin
 * and persists SecurityAlert records in the database.
 *
 * Why in-memory?  This process is single-instance (PM2 cluster mode is off)
 * so a Map is fine and avoids an external dependency (Redis).  The DB write
 * is the durable record; the Map just drives the "should we alert?" decision.
 */

import { prisma } from '@/lib/prisma';
import { sendIntrusionAlertEmail } from '@/lib/email';
import { notifySecurityAlert } from '@/lib/node-red';

// ── Types ──────────────────────────────────────────────────

export type SecurityEventType =
  | 'admin_access_denied'   // Non-intranet IP hit /admin or /api/admin
  | 'admin_login_failed'    // Wrong password / disabled account on admin login
  | 'admin_2fa_failed'      // Invalid 2FA code on admin login
  | 'admin_token_invalid'   // Forged / expired admin session token
  | 'brute_force'           // Auto-escalated when threshold is hit
  | 'rate_limit';           // (reserved for future nginx log ingestion)

export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityEvent {
  type: SecurityEventType;
  ip: string;
  path?: string;
  userAgent?: string;
  details?: Record<string, unknown>;
}

// ── Configuration ──────────────────────────────────────────

/** Sliding window length in milliseconds (15 minutes) */
const WINDOW_MS = 15 * 60 * 1000;

/** How many events of the same type from the same IP before we alert */
const ALERT_THRESHOLDS: Record<SecurityEventType, number> = {
  admin_access_denied: 3,
  admin_login_failed: 5,
  admin_2fa_failed: 3,
  admin_token_invalid: 3,
  brute_force: 1,       // already escalated — always alert
  rate_limit: 20,
};

/** Minimum gap between repeated email alerts for the same (type, IP) pair */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

/** Severity mapping per event type */
const SEVERITY_MAP: Record<SecurityEventType, AlertSeverity> = {
  admin_access_denied: 'high',
  admin_login_failed: 'medium',
  admin_2fa_failed: 'high',
  admin_token_invalid: 'critical',
  brute_force: 'critical',
  rate_limit: 'low',
};

// ── In-memory state ────────────────────────────────────────

interface WindowEntry {
  timestamps: number[];
  lastAlertAt: number;
}

/**
 * Key = `${eventType}:${ip}`
 * Value = list of event timestamps within the current window + last alert time
 */
const tracker = new Map<string, WindowEntry>();

/** Periodic cleanup so the Map doesn't grow unboundedly */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    tracker.forEach((entry, key) => {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) tracker.delete(key);
    });
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the process alive just for cleanup
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ── Public API ─────────────────────────────────────────────

/**
 * Record a security event.  When the sliding-window count for this
 * (eventType, IP) pair exceeds the threshold, an alert email is sent
 * and a SecurityAlert row is persisted.
 *
 * Safe to call from API routes.  Never throws — failures are logged.
 */
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  try {
    ensureCleanupTimer();

    const now = Date.now();
    const key = `${event.type}:${event.ip}`;
    const cutoff = now - WINDOW_MS;

    let entry = tracker.get(key);
    if (!entry) {
      entry = { timestamps: [], lastAlertAt: 0 };
      tracker.set(key, entry);
    }

    // Prune old timestamps and push the new one
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    entry.timestamps.push(now);

    const threshold = ALERT_THRESHOLDS[event.type] ?? 5;
    const count = entry.timestamps.length;

    // Always persist a DB record for every event
    await persistAlert(event, count >= threshold ? 'alerted' : 'tracked');

    // Check if threshold is exceeded and cooldown has passed
    if (count >= threshold && now - entry.lastAlertAt > ALERT_COOLDOWN_MS) {
      entry.lastAlertAt = now;

      const severity = SEVERITY_MAP[event.type] ?? 'medium';

      // Auto-escalate to brute_force if it isn't already
      const escalatedType: SecurityEventType =
        event.type !== 'brute_force' && count >= threshold * 2
          ? 'brute_force'
          : event.type;

      console.warn(
        `[Intrusion] ALERT — ${escalatedType} from ${event.ip} ` +
        `(${count} events in ${WINDOW_MS / 60000}min window) path=${event.path ?? '-'}`
      );

      // Fire email (don't await — best-effort)
      sendIntrusionAlertEmail({
        eventType: escalatedType,
        severity,
        sourceIp: event.ip,
        path: event.path,
        userAgent: event.userAgent,
        count,
        windowMinutes: WINDOW_MS / 60000,
        details: event.details,
      }).catch(err => console.error('[Intrusion] Email send failed:', err));

      // Notify Node-RED → WhatsApp for high/critical (fire-and-forget)
      if (severity === 'high' || severity === 'critical') {
        notifySecurityAlert({
          severity,
          eventType: escalatedType,
          sourceIp: event.ip,
          details: `${count} events in ${WINDOW_MS / 60000}min from ${event.ip} — path: ${event.path ?? '-'}`,
        });
      }
    }
  } catch (err) {
    // Never let intrusion tracking break the main request
    console.error('[Intrusion] recordSecurityEvent failed:', err);
  }
}

// ── Persistence ────────────────────────────────────────────

async function persistAlert(event: SecurityEvent, status: string): Promise<void> {
  try {
    await prisma.securityAlert.create({
      data: {
        eventType: event.type,
        severity: SEVERITY_MAP[event.type] ?? 'medium',
        sourceIp: event.ip,
        path: event.path ?? null,
        userAgent: event.userAgent ?? null,
        details: event.details
          ? JSON.stringify({ ...event.details, _status: status })
          : JSON.stringify({ _status: status }),
      },
    });
  } catch (err) {
    console.error('[Intrusion] DB persist failed:', err);
  }
}
