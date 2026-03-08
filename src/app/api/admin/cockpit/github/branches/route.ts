import { NextRequest, NextResponse } from 'next/server';
import { listBranches, deleteBranch, mergeBranches, compareBranches } from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const repo = req.nextUrl.searchParams.get('repo') || undefined;
    const branches = await listBranches(repo);
    return NextResponse.json({ branches });
  } catch (error) {
    console.error('Branch list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch branches' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, repo, branch, base, head, commitMessage } = body;

    if (!repo) {
      return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    }

    if (action === 'delete') {
      if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 });
      const result = await deleteBranch(repo, branch);
      return NextResponse.json(result);
    }

    if (action === 'merge') {
      if (!base || !head) return NextResponse.json({ error: 'base and head are required' }, { status: 400 });
      const result = await mergeBranches(repo, base, head, commitMessage);
      return NextResponse.json(result);
    }

    if (action === 'compare') {
      if (!base || !head) return NextResponse.json({ error: 'base and head are required' }, { status: 400 });
      const result = await compareBranches(repo, base, head);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Branch action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}
