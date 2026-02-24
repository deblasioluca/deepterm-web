import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 30 * 1000; // 30 seconds block (reduced for testing)

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number; // seconds
}

/**
 * Get the rate limit key for a request
 */
export function getRateLimitKey(email: string, ip: string): string {
  return `${email.toLowerCase()}:${ip}`;
}

/**
 * Check and update rate limit for a given key
 * Uses database as fallback (Redis recommended for production)
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const now = new Date();
  
  // Find existing entry
  let entry = await prisma.rateLimitEntry.findUnique({
    where: { key },
  });

  // Check if blocked
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    const retryAfter = Math.ceil((entry.blockedUntil.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.blockedUntil,
      retryAfter,
    };
  }

  // Check if window has expired
  if (entry) {
    const windowEnd = new Date(entry.windowStart.getTime() + RATE_LIMIT_WINDOW_MS);

    if (now > windowEnd) {
      // Window expired, reset — use upsert in case the entry was deleted concurrently
      entry = await prisma.rateLimitEntry.upsert({
        where: { key },
        update: {
          attempts: 1,
          windowStart: now,
          blockedUntil: null,
        },
        create: {
          key,
          attempts: 1,
          windowStart: now,
        },
      });
    } else {
      // Within window, increment attempts
      const newAttempts = entry.attempts + 1;

      if (newAttempts > MAX_ATTEMPTS) {
        // Block the user — use upsert in case the entry was deleted concurrently
        const blockedUntil = new Date(now.getTime() + BLOCK_DURATION_MS);
        await prisma.rateLimitEntry.upsert({
          where: { key },
          update: {
            attempts: newAttempts,
            blockedUntil,
          },
          create: {
            key,
            attempts: newAttempts,
            windowStart: now,
            blockedUntil,
          },
        });

        const retryAfter = Math.ceil(BLOCK_DURATION_MS / 1000);
        return {
          allowed: false,
          remaining: 0,
          resetAt: blockedUntil,
          retryAfter,
        };
      }

      // Use upsert to gracefully handle a concurrent delete (e.g. resetRateLimit)
      entry = await prisma.rateLimitEntry.upsert({
        where: { key },
        update: { attempts: newAttempts },
        create: {
          key,
          attempts: 1,
          windowStart: now,
        },
      });
    }
  } else {
    // Create new entry
    entry = await prisma.rateLimitEntry.create({
      data: {
        key,
        attempts: 1,
        windowStart: now,
      },
    });
  }

  const windowEnd = new Date(entry.windowStart.getTime() + RATE_LIMIT_WINDOW_MS);
  
  return {
    allowed: true,
    remaining: MAX_ATTEMPTS - entry.attempts,
    resetAt: windowEnd,
  };
}

/**
 * Reset rate limit for a key (e.g., after successful login)
 */
export async function resetRateLimit(key: string): Promise<void> {
  try {
    await prisma.rateLimitEntry.delete({
      where: { key },
    });
  } catch {
    // Entry might not exist, ignore
  }
}

/**
 * Clean up old rate limit entries (run periodically)
 */
export async function cleanupRateLimits(): Promise<number> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS * 2);
  
  const result = await prisma.rateLimitEntry.deleteMany({
    where: {
      windowStart: { lt: cutoff },
      blockedUntil: { lt: new Date() },
    },
  });
  
  return result.count;
}

/**
 * Rate limiting middleware helper
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    {
      error: 'Too many requests',
      message: 'You have exceeded the maximum number of login attempts. Please try again later.',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter || 900),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': result.resetAt.toISOString(),
      },
    }
  );
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback
  return '127.0.0.1';
}
