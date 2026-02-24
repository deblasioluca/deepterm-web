/**
 * POST /api/internal/security-event
 *
 * Lightweight endpoint called by middleware (fire-and-forget) to record
 * security events that require Prisma + email (which middleware can't
 * import directly due to Edge Runtime compilation).
 *
 * Only accepts requests from localhost / private IPs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { recordSecurityEvent, type SecurityEventType } from '@/lib/intrusion';

function isLocalRequest(request: NextRequest): boolean {
  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    request.ip ??
    '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip === ''
  );
}

export async function POST(request: NextRequest) {
  // Only accept from the local machine (middleware fetch)
  if (!isLocalRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      type?: string;
      ip?: string;
      path?: string;
      userAgent?: string;
      details?: Record<string, unknown>;
    };

    if (!body.type || !body.ip) {
      return NextResponse.json({ error: 'type and ip required' }, { status: 400 });
    }

    // Don't await — let it run in background so middleware isn't blocked
    recordSecurityEvent({
      type: body.type as SecurityEventType,
      ip: body.ip,
      path: body.path,
      userAgent: body.userAgent,
      details: body.details,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
