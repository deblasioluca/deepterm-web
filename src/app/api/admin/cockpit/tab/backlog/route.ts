import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const count = await prisma.githubIssue.count();
    if (count === 0) {
      try {
        const { syncAllGithubIssues } = await import('@/lib/github-sync');
        await syncAllGithubIssues();
      } catch (err) { console.error('[Backlog] GitHub sync failed:', err); }
    }

    const [openIssues, closedIssues] = await Promise.all([
      prisma.githubIssue.findMany({ where: { state: 'open' }, orderBy: { githubUpdatedAt: 'desc' }, take: 50 }),
      prisma.githubIssue.findMany({ where: { state: 'closed' }, orderBy: { githubUpdatedAt: 'desc' }, take: 10 }),
    ]);

    const allIssues = [...openIssues, ...closedIssues].map((issue) => ({
      number: issue.number, title: issue.title, body: issue.body, state: issue.state,
      labels: (() => { try { return JSON.parse(issue.labels); } catch { return []; } })(),
      milestone: issue.milestone, assignee: issue.assignee,
      createdAt: issue.githubCreatedAt.toISOString(), updatedAt: issue.githubUpdatedAt.toISOString(), url: issue.url,
    }));

    return NextResponse.json({
      open: openIssues.length, closed: closedIssues.length, items: allIssues,
      lastSyncedAt: openIssues[0]?.syncedAt?.toISOString() || null,
    });
  } catch { return NextResponse.json({ open: 0, closed: 0, items: [], lastSyncedAt: null }); }
}
