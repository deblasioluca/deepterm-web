/**
 * POST /api/internal/track
 *
 * Fire-and-forget endpoint called by middleware to record page views.
 * Only accepts requests from localhost (middleware fetch).
 * Performs IP geolocation via ip-api.com (free, no key required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Simple bot detection based on user-agent patterns
const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /slurp/i, /mediapartners/i,
  /lighthouse/i, /pagespeed/i, /headless/i, /phantom/i,
  /wget/i, /curl/i, /python-requests/i, /go-http-client/i,
  /axios/i, /node-fetch/i, /scrapy/i, /semrush/i, /ahrefs/i,
];

function isBot(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
}

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

function hashIp(ip: string): string {
  // Use a stable salt derived from the app — not truly secret, but prevents
  // trivial rainbow-table reversal of hashed IPs.
  const salt = process.env.IP_HASH_SALT ?? 'deepterm-analytics-salt';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}

// Simple session fingerprint from IP + user-agent + date (daily sessions)
function sessionFingerprint(ip: string, userAgent: string | null): string {
  const day = new Date().toISOString().slice(0, 10);
  const raw = `${ip}:${userAgent ?? ''}:${day}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

interface GeoResult {
  countryCode?: string;
  city?: string;
  lat?: number;
  lon?: number;
}

async function geolocateIp(ip: string): Promise<GeoResult> {
  try {
    // ip-api.com free tier: 45 req/min, no key needed
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,city,lat,lon`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return {};
    const data = await res.json() as {
      status?: string;
      countryCode?: string;
      city?: string;
      lat?: number;
      lon?: number;
    };
    if (data.status !== 'success') return {};
    return {
      countryCode: data.countryCode,
      city: data.city,
      lat: data.lat,
      lon: data.lon,
    };
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      path?: string;
      ip?: string;
      userAgent?: string;
      referrer?: string;
    };

    if (!body.path || !body.ip) {
      return NextResponse.json({ error: 'path and ip required' }, { status: 400 });
    }

    const bot = isBot(body.userAgent ?? null);
    const ipHash = hashIp(body.ip);
    const session = sessionFingerprint(body.ip, body.userAgent ?? null);

    // Geo lookup (don't block the response on this)
    const geoPromise = geolocateIp(body.ip);

    // Insert page view asynchronously
    geoPromise.then(async (geo) => {
      try {
        await prisma.pageView.create({
          data: {
            path: body.path!,
            ipHash,
            userAgent: body.userAgent?.slice(0, 500) ?? null,
            referrer: body.referrer?.slice(0, 1000) ?? null,
            countryCode: geo.countryCode ?? null,
            city: geo.city ?? null,
            latitude: geo.lat ?? null,
            longitude: geo.lon ?? null,
            isBot: bot,
            sessionId: session,
          },
        });
      } catch (err) {
        console.error('Failed to record page view:', err);
      }
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
}
