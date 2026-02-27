import { NextResponse } from 'next/server';
import { listOpenPRs } from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const prs = await listOpenPRs();
    return NextResponse.json({ pulls: prs });
  } catch (error) {
    console.error('PR list error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch PRs';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
