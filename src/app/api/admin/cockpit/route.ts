import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getSystemHealth() {
  const piUptime = process.uptime();
  const piMemory = process.memoryUsage();

  let nodeRedStatus = 'offline';
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('http://192.168.1.30:1880', { signal: ctrl.signal });
    clearTimeout(tid);
    nodeRedStatus = res.ok ? 'online' : 'degraded';
  } catch { nodeRedStatus = 'offline'; }

  let ciMacStatus = 'unknown';
  try {
    const ghToken = process.env.GITHUB_TOKEN;
    if (ghToken) {
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch('https://api.github.com/repos/deblasioluca/deepterm/actions/runners', {
        headers: { Authorization: `Bearer ${ghToken}`, Accept: 'application/vnd.github+json' },
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const data = await res.json();
        const runner = data.runners?.[0];
        ciMacStatus = runner?.status === 'online' ? 'online' : 'offline';
      }
    }
  } catch { ciMacStatus = 'unknown'; }

  return {
    pi: {
      status: 'online',
      uptimeSeconds: Math.floor(piUptime),
      memoryMB: Math.round(piMemory.rss / 1024 / 1024),
      heapMB: Math.round(piMemory.heapUsed / 1024 / 1024),
    },
    nodeRed: { status: nodeRedStatus },
    ciMac: { status: ciMacStatus },
  };
}

async function getRecentBuilds() {
  try {
    const builds = await prisma.ciBuild.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return builds;
  } catch {
    return [];
  }
}

async function getRecentEvents() {
  try {
    const events = await prisma.githubEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    return events;
  } catch {
    return [];
  }
}

async function getQuickStats() {
  const [issueCount, ideaCount, releaseCount, userCount] = await Promise.all([
    prisma.issue.count().catch(() => 0),
    prisma.idea.count().catch(() => 0),
    prisma.release.count().catch(() => 0),
    prisma.user.count().catch(() => 0),
  ]);

  const openIssues = await prisma.issue.count({ where: { status: 'open' } }).catch(() => 0);
  const latestRelease = await prisma.release.findFirst({ orderBy: { publishedAt: 'desc' } }).catch(() => null);

  return {
    issues: { total: issueCount, open: openIssues },
    ideas: ideaCount,
    releases: { total: releaseCount, latest: latestRelease?.version || 'none' },
    users: userCount,
  };
}

async function getGithubIssues() {
  try {
    // Auto-sync on first load (empty DB)
    const count = await prisma.githubIssue.count();
    if (count === 0) {
      try {
        const { syncAllGithubIssues } = await import('@/lib/github-sync');
        await syncAllGithubIssues();
      } catch (err) {
        console.error('[Cockpit] Initial GitHub sync failed:', err);
      }
    }

    const [openIssues, closedIssues] = await Promise.all([
      prisma.githubIssue.findMany({
        where: { state: 'open' },
        orderBy: { githubUpdatedAt: 'desc' },
        take: 50,
      }),
      prisma.githubIssue.findMany({
        where: { state: 'closed' },
        orderBy: { githubUpdatedAt: 'desc' },
        take: 10,
      }),
    ]);

    const allIssues = [...openIssues, ...closedIssues].map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: (() => { try { return JSON.parse(issue.labels); } catch { return []; } })(),
      milestone: issue.milestone,
      assignee: issue.assignee,
      createdAt: issue.githubCreatedAt.toISOString(),
      updatedAt: issue.githubUpdatedAt.toISOString(),
      url: issue.url,
    }));

    const latestSync = openIssues[0]?.syncedAt || closedIssues[0]?.syncedAt || null;

    return {
      open: openIssues.length,
      closed: closedIssues.length,
      items: allIssues,
      lastSyncedAt: latestSync?.toISOString() || null,
    };
  } catch {
    return { open: 0, closed: 0, items: [], lastSyncedAt: null };
  }
}

async function getTriageQueue() {
  const [pendingIssues, pendingIdeas] = await Promise.all([
    prisma.issue.findMany({
      where: { status: 'open' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { user: { select: { email: true, name: true } } },
    }).catch(() => []),
    prisma.idea.findMany({
      where: { status: 'consideration' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        author: { select: { email: true, name: true } },
        votes: true,
      },
    }).catch(() => []),
  ]);

  return {
    issues: pendingIssues.map((i: any) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      area: i.area,
      status: i.status,
      reporter: i.user?.email || i.user?.name || 'unknown',
      createdAt: i.createdAt,
    })),
    ideas: pendingIdeas.map((i: any) => ({
      id: i.id,
      title: i.title,
      description: i.description,
      category: i.category,
      status: i.status,
      author: i.author?.email || i.author?.name || 'unknown',
      votes: i.votes?.length || 0,
      createdAt: i.createdAt,
    })),
  };
}

async function getPlanningData() {
  try {
    const [epics, unassignedStories] = await Promise.all([
      prisma.epic.findMany({
        orderBy: { sortOrder: 'asc' },
        include: { stories: { orderBy: { sortOrder: 'asc' } } },
      }),
      prisma.story.findMany({
        where: { epicId: null },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return { epics, unassignedStories };
  } catch {
    return { epics: [], unassignedStories: [] };
  }
}

async function getRevenue() {
  try {
    const [totalUsers, proUsers, recentPayments] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { plan: 'pro' } }),
      prisma.paymentEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      totalUsers,
      proUsers,
      freeUsers: totalUsers - proUsers,
      conversionRate: totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : '0',
      recentPayments,
    };
  } catch {
    return { totalUsers: 0, proUsers: 0, freeUsers: 0, conversionRate: '0', recentPayments: [] };
  }
}

export async function GET() {
  try {
    const [health, builds, events, stats, githubIssues, triageQueue, revenue, planning] = await Promise.all([
      getSystemHealth(),
      getRecentBuilds(),
      getRecentEvents(),
      getQuickStats(),
      getGithubIssues(),
      getTriageQueue(),
      getRevenue(),
      getPlanningData(),
    ]);

    return NextResponse.json({ health, builds, events, stats, githubIssues, triageQueue, revenue, planning, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Cockpit API error:', error);
    return NextResponse.json({ error: 'Failed to load cockpit data' }, { status: 500 });
  }
}
