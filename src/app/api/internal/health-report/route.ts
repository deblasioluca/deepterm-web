/**
 * POST /api/internal/health-report
 *
 * Receives periodic health check data from Airflow health_check DAG.
 * Stores latest report in SystemSettings for cockpit display.
 *
 * Headers: x-api-key (must match AI_DEV_API_KEY)
 * Body: { pi: {...}, ci_mac: {...}, node_red: {...} }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_DEV_API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!AI_DEV_API_KEY || apiKey !== AI_DEV_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Store latest health report as JSON in SystemSettings
    await prisma.systemSettings.upsert({
      where: { key: 'last_health_report' },
      create: {
        key: 'last_health_report',
        value: JSON.stringify({
          ...body,
          receivedAt: new Date().toISOString(),
        }),
      },
      update: {
        value: JSON.stringify({
          ...body,
          receivedAt: new Date().toISOString(),
        }),
      },
    });

    // Also store timestamp of last successful check
    await prisma.systemSettings.upsert({
      where: { key: 'last_health_check_at' },
      create: { key: 'last_health_check_at', value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[health-report] Error:', error);
    return NextResponse.json(
      { error: 'Failed to store health report' },
      { status: 500 }
    );
  }
}
