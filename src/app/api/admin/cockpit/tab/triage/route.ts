import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [pendingIssues, pendingIdeas] = await Promise.all([
      prisma.issue.findMany({
        where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 10,
        include: { user: { select: { email: true, name: true } } },
      }).catch(() => []),
      prisma.idea.findMany({
        where: { status: 'consideration' }, orderBy: { createdAt: 'desc' }, take: 10,
        include: { author: { select: { email: true, name: true } }, votes: true },
      }).catch(() => []),
    ]);

    return NextResponse.json({
      issues: pendingIssues.map((i: any) => ({
        id: i.id, title: i.title, description: i.description, area: i.area,
        status: i.status, reporter: i.user?.email || i.user?.name || 'unknown', createdAt: i.createdAt,
      })),
      ideas: pendingIdeas.map((i: any) => ({
        id: i.id, title: i.title, description: i.description, category: i.category,
        status: i.status, author: i.author?.email || i.author?.name || 'unknown',
        votes: i.votes?.length || 0, createdAt: i.createdAt,
      })),
    });
  } catch { return NextResponse.json({ issues: [], ideas: [] }); }
}
