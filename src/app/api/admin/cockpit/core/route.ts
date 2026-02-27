import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [issueCount, ideaCount, releaseCount, userCount, openIssues, proUsers, latestRelease, triageIssues, triageIdeas] = await Promise.all([
      prisma.issue.count().catch(() => 0),
      prisma.idea.count().catch(() => 0),
      prisma.release.count().catch(() => 0),
      prisma.user.count().catch(() => 0),
      prisma.issue.count({ where: { status: "open" } }).catch(() => 0),
      prisma.user.count({ where: { plan: "pro" } }).catch(() => 0),
      prisma.release.findFirst({ orderBy: { publishedAt: "desc" } }).catch(() => null),
      prisma.issue.count({ where: { status: "open" } }).catch(() => 0),
      prisma.idea.count({ where: { status: "consideration" } }).catch(() => 0),
    ]);

    return NextResponse.json({
      stats: {
        issues: { total: issueCount, open: openIssues },
        ideas: ideaCount,
        releases: { total: releaseCount, latest: latestRelease?.version || "none" },
        users: userCount,
      },
      revenue: {
        totalUsers: userCount,
        proUsers,
        freeUsers: userCount - proUsers,
        conversionRate: userCount > 0 ? ((proUsers / userCount) * 100).toFixed(1) : "0",
      },
      triageCount: triageIssues + triageIdeas,
      health: { pi: { status: "online", uptimeSeconds: Math.floor(process.uptime()), memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024) } },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Core API error:", error);
    return NextResponse.json({ error: "Failed to load core data" }, { status: 500 });
  }
}
