/**
 * POST /api/internal/node-red/command
 *
 * Called by Node-RED when the admin requests system info via WhatsApp.
 * Returns a formatted summary string for WhatsApp display.
 *
 * Headers: x-api-key (must match NODE_RED_API_KEY env var)
 * Body:    { command: "status"|"health"|"releases"|"licenses" }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_RED_API_KEY = process.env.NODE_RED_API_KEY || '';

export async function POST(request: NextRequest) {
  // ── Auth ──
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== NODE_RED_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as { command?: string };
    const { command } = body;

    if (!command || !['status', 'health', 'releases', 'licenses'].includes(command)) {
      return NextResponse.json(
        { error: 'Invalid command. Must be: status, health, releases, or licenses' },
        { status: 400 }
      );
    }

    let summary = '';

    switch (command) {
      case 'status': {
        const [userCount, issueCount, ideaCount, openIssues, latestRelease] = await Promise.all([
          prisma.user.count(),
          prisma.issue.count(),
          prisma.idea.count(),
          prisma.issue.count({ where: { status: 'open' } }),
          prisma.release.findFirst({ orderBy: { publishedAt: 'desc' }, select: { version: true, publishedAt: true } }),
        ]);

        summary = `📊 *DeepTerm Status*\n`;
        summary += `━━━━━━━━━━━━━━━━━━\n`;
        summary += `👤 Users: ${userCount}\n`;
        summary += `🐛 Issues: ${issueCount} (${openIssues} open)\n`;
        summary += `💡 Ideas: ${ideaCount}\n`;
        if (latestRelease) {
          summary += `🚀 Latest: v${latestRelease.version} (${latestRelease.publishedAt.toLocaleDateString()})`;
        }
        break;
      }

      case 'health': {
        const start = Date.now();

        // Test database connectivity
        let dbOk = false;
        try {
          await prisma.$queryRaw`SELECT 1`;
          dbOk = true;
        } catch {
          dbOk = false;
        }

        const dbMs = Date.now() - start;

        // Check recent security alerts
        const recentAlerts = await prisma.securityAlert.count({
          where: {
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
            resolved: false,
          },
        });

        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const mins = Math.floor((uptime % 3600) / 60);

        summary = `🏥 *DeepTerm Health*\n`;
        summary += `━━━━━━━━━━━━━━━━━━\n`;
        summary += `💾 Database: ${dbOk ? '✅ OK' : '❌ DOWN'} (${dbMs}ms)\n`;
        summary += `⏱ Uptime: ${hours}h ${mins}m\n`;
        summary += `🛡️ Unresolved alerts (24h): ${recentAlerts}\n`;
        summary += `📡 Node.js: ${process.version}`;
        break;
      }

      case 'releases': {
        const releases = await prisma.release.findMany({
          orderBy: { publishedAt: 'desc' },
          take: 5,
          select: { version: true, platform: true, publishedAt: true, releaseNotes: true },
        });

        summary = `🚀 *Recent Releases*\n`;
        summary += `━━━━━━━━━━━━━━━━━━\n`;

        if (releases.length === 0) {
          summary += `No releases found.`;
        } else {
          for (const r of releases) {
            const date = r.publishedAt.toLocaleDateString();
            const notes = r.releaseNotes
              ? r.releaseNotes.substring(0, 80) + (r.releaseNotes.length > 80 ? '…' : '')
              : '';
            summary += `\n*v${r.version}* (${r.platform}) – ${date}\n`;
            if (notes) summary += `${notes}\n`;
          }
        }
        break;
      }

      case 'licenses': {
        // Count subscriptions by type/status
        const [totalUsers, orgCount, activeOrgs] = await Promise.all([
          prisma.user.count(),
          prisma.organization.count(),
          prisma.organization.count({ where: { subscriptionStatus: 'active' } }),
        ]);

        summary = `🔑 *License Summary*\n`;
        summary += `━━━━━━━━━━━━━━━━━━\n`;
        summary += `👤 Total users: ${totalUsers}\n`;
        summary += `👥 Organizations: ${orgCount} (${activeOrgs} active)\n`;
        summary += `🆓 Starter: ${orgCount - activeOrgs}\n`;
        summary += `⭐ Paid: ${activeOrgs}`;
        break;
      }
    }

    return NextResponse.json({ summary, command });
  } catch (error) {
    console.error('Node-RED command error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
