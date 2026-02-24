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

export async function GET() {
  try {
    const [health, builds, events, stats] = await Promise.all([
      getSystemHealth(),
      getRecentBuilds(),
      getRecentEvents(),
      getQuickStats(),
    ]);

    return NextResponse.json({ health, builds, events, stats, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('Cockpit API error:', error);
    return NextResponse.json({ error: 'Failed to load cockpit data' }, { status: 500 });
  }
}
