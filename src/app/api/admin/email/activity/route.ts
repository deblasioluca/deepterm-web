import { NextResponse } from 'next/server';
import { listLogs } from '@/lib/improvmx';

export const dynamic = 'force-dynamic';

/** GET /api/admin/email/activity — list recent email logs */
export async function GET() {
  try {
    const logs = await listLogs();
    return NextResponse.json({ logs });
  } catch (error) {
    console.error('Failed to list email logs:', error);
    return NextResponse.json(
      { error: 'Failed to list logs', message: String(error) },
      { status: 500 },
    );
  }
}
