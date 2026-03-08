import { NextRequest, NextResponse } from 'next/server';
import {
  listWorkflowRuns,
  getWorkflowRunJobs,
  rerunWorkflow,
  cancelWorkflowRun,
} from '@/lib/github-pulls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const repo = req.nextUrl.searchParams.get('repo') || undefined;
    const branch = req.nextUrl.searchParams.get('branch') || undefined;
    const status = req.nextUrl.searchParams.get('status') || undefined;
    const perPage = parseInt(req.nextUrl.searchParams.get('perPage') || '20', 10);
    const runs = await listWorkflowRuns(repo, { branch, status, perPage });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error('Workflow runs error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch runs' },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, repo, runId } = body;

    if (!repo || !runId) {
      return NextResponse.json({ error: 'repo and runId are required' }, { status: 400 });
    }

    if (action === 'jobs') {
      const jobs = await getWorkflowRunJobs(repo, runId);
      return NextResponse.json({ jobs });
    }

    if (action === 'rerun') {
      const result = await rerunWorkflow(repo, runId);
      return NextResponse.json(result);
    }

    if (action === 'cancel') {
      const result = await cancelWorkflowRun(repo, runId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Workflow action error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Action failed' },
      { status: 500 }
    );
  }
}
