/**
 * Intrusion Detection & Alerting
 *
 * Sliding-window tracker that triggers email alerts to the admin
 * and persists SecurityAlert records in the database.
 *
 * Uses Redis when REDIS_URL is configured (works across PM2 cluster /
 * multiple containers).  Falls back to an in-memory Map when Redis is
 * unavailable.  The DB write is always the durable record; the
 * sliding-window store only drives the "should we alert?" decision.
 */

import { prisma } from '@/lib/prisma';
import { redis } from '@/lib/redis';
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

/** Window length in seconds (for Redis TTL) */
const WINDOW_SECONDS = Math.ceil(WINDOW_MS / 1000);

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

// ── Redis key helpers ──────────────────────────────────────

const REDIS_PREFIX = 'intrusion:';

function countKey(eventType: string, ip: string): string {
  return `${REDIS_PREFIX}count:${eventType}:${ip}`;
}

function cooldownKey(eventType: string, ip: string): string {
  return `${REDIS_PREFIX}cooldown:${eventType}:${ip}`;
}

// ── In-memory fallback state ───────────────────────────────

interface WindowEntry {
  timestamps: number[];
  lastAlertAt: number;
}

/**
 * Key = `${eventType}:${ip}`
 * Only used when Redis is unavailable.
 */
const memTracker = new Map<string, WindowEntry>();

/** Periodic cleanup so the Map doesn't grow unboundedly */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // every 5 min
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - WINDOW_MS;
    memTracker.forEach((entry, key) => {
      entry.timestamps = entry.timestamps.filter(t => t > cutoff);
      if (entry.timestamps.length === 0) memTracker.delete(key);
    });
  }, CLEANUP_INTERVAL_MS);
  // Don't keep the process alive just for cleanup
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ── Sliding-window backends ────────────────────────────────

interface WindowResult {
  count: number;
  cooldownActive: boolean;
}

/**
 * Record an event in Redis and return the current window count.
 * Uses a sorted set with timestamps as scores for precise sliding-window.
 */
async function recordInRedis(eventType: string, ip: string, now: number): Promise<WindowResult> {
  if (!redis) throw new Error('Redis not available');

  const cKey = countKey(eventType, ip);
  const cdKey = cooldownKey(eventType, ip);
  const cutoff = now - WINDOW_MS;

  // Pipeline: remove old entries, add new, count, check cooldown
  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(cKey, '-inf', cutoff);
  pipeline.zadd(cKey, now, `${now}:${Math.random().toString(36).slice(2, 8)}`);
  pipeline.zcard(cKey);
  pipeline.expire(cKey, WINDOW_SECONDS + 60); // TTL slightly longer than window
  pipeline.exists(cdKey);

  const results = await pipeline.exec();
  if (!results) throw new Error('Redis pipeline returned null');

  const count = (results[2][1] as number) || 0;
  const cooldownActive = (results[4][1] as number) === 1;

  return { count, cooldownActive };
}

async function setCooldownInRedis(eventType: string, ip: string): Promise<void> {
  if (!redis) return;
  const cdKey = cooldownKey(eventType, ip);
  const cooldownSeconds = Math.ceil(ALERT_COOLDOWN_MS / 1000);
  await redis.setex(cdKey, cooldownSeconds, '1');
}

/**
 * Record an event in the in-memory fallback tracker.
 */
function recordInMemory(eventType: string, ip: string, now: number): WindowResult {
  ensureCleanupTimer();

  const key = `${eventType}:${ip}`;
  const cutoff = now - WINDOW_MS;

  let entry = memTracker.get(key);
  if (!entry) {
    entry = { timestamps: [], lastAlertAt: 0 };
    memTracker.set(key, entry);
  }

  // Prune old timestamps and push the new one
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);
  entry.timestamps.push(now);

  return {
    count: entry.timestamps.length,
    cooldownActive: now - entry.lastAlertAt < ALERT_COOLDOWN_MS,
  };
}

function setCooldownInMemory(eventType: string, ip: string, now: number): void {
  const key = `${eventType}:${ip}`;
  const entry = memTracker.get(key);
  if (entry) entry.lastAlertAt = now;
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
    const now = Date.now();

    // Try Redis first, fall back to in-memory
    let result: WindowResult;
    let usingRedis = false;
    try {
      if (redis && redis.status === 'ready') {
        result = await recordInRedis(event.type, event.ip, now);
        usingRedis = true;
      } else {
        result = recordInMemory(event.type, event.ip, now);
      }
    } catch {
      // Redis failed — fall back to in-memory
      result = recordInMemory(event.type, event.ip, now);
    }

    const { count, cooldownActive } = result;
    const threshold = ALERT_THRESHOLDS[event.type] ?? 5;

    // Always persist a DB record for every event
    await persistAlert(event, count >= threshold ? 'alerted' : 'tracked');

    // Check if threshold is exceeded and cooldown has passed
    if (count >= threshold && !cooldownActive) {
      // Set cooldown
      if (usingRedis) {
        setCooldownInRedis(event.type, event.ip).catch(err =>
          console.error('[Intrusion] Redis cooldown set failed:', err)
        );
      } else {
        setCooldownInMemory(event.type, event.ip, now);
      }

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
