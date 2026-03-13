import { NextResponse } from 'next/server';
import { cleanupExpiredTokens } from '@/lib/zk/jwt';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// Internal cron endpoint — called by PM2 cron job (ecosystem.config.js) daily
// Auth: x-cron-secret header must match CRON_SECRET env var
export async function GET(request: Request) {
  const secret = request.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const results: Record<string, number> = {};

    // 1. Delete expired and revoked refresh tokens
    results.expiredTokens = await cleanupExpiredTokens();

    // 2. Delete old rate limit entries (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const rlResult = await prisma.rateLimitEntry.deleteMany({
      where: { windowStart: { lt: oneHourAgo } },
    });
    results.rateLimitEntries = rlResult.count;

    console.log('[cron/cleanup] Completed:', results);
    return NextResponse.json({ ok: true, cleaned: results, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[cron/cleanup] Error:', error);
    return NextResponse.json({ error: 'Cleanup failed' }, { status: 500 });
  }
}
