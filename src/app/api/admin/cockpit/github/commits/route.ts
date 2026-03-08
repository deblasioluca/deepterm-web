import { NextRequest, NextResponse } from 'next/server';
import { listCommits, getCommitDetail } from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const repo = req.nextUrl.searchParams.get('repo') || undefined;
    const branch = req.nextUrl.searchParams.get('branch') || undefined;
    const perPage = parseInt(req.nextUrl.searchParams.get('perPage') || '30', 10);
    const commits = await listCommits(repo, branch, perPage);
    return NextResponse.json({ commits });
  } catch (error) {
    console.error('Commits list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch commits' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { repo, sha } = await req.json();
    if (!repo || !sha) {
      return NextResponse.json({ error: 'repo and sha are required' }, { status: 400 });
    }
    const detail = await getCommitDetail(repo, sha);
    return NextResponse.json(detail);
  } catch (error) {
    console.error('Commit detail error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch commit' },
      { status: 500 }
    );
  }
}
