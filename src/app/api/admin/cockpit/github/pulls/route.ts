import { NextRequest, NextResponse } from 'next/server';
import { listAllPRs, closePR } from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const repo = req.nextUrl.searchParams.get('repo') || undefined;
    const state = (req.nextUrl.searchParams.get('state') || 'all') as 'open' | 'closed' | 'all';
    const perPage = parseInt(req.nextUrl.searchParams.get('perPage') || '30', 10);
    const prs = await listAllPRs(repo, state, perPage);
    return NextResponse.json({ pulls: prs });
  } catch (error) {
    console.error('All PRs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch PRs' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, repo, number } = await req.json();

    if (action === 'close') {
      if (!repo || !number) return NextResponse.json({ error: 'repo and number required' }, { status: 400 });
      const result = await closePR(repo, number);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('PR action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}
