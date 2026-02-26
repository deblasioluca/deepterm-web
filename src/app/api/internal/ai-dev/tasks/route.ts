/**
 * GET /api/internal/ai-dev/tasks
 *
 * Returns Stories available for the AI Dev Mac to work on.
 * Includes linked GitHub issue context when available.
 *
 * Headers: x-api-key (must match AI_DEV_API_KEY or NODE_RED_API_KEY env var)
 *
 * Query params:
 *   status - filter by status (default: "planned,in_progress")
 *   epicId - filter by epic (optional)
 *
 * Response: { stories: Story[], epics: Epic[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AI_DEV_API_KEY = process.env.AI_DEV_API_KEY || process.env.NODE_RED_API_KEY || '';

export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (!AI_DEV_API_KEY || apiKey !== AI_DEV_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status') || 'planned,in_progress';
    const epicId = searchParams.get('epicId');
    const statuses = statusFilter.split(',').map(s => s.trim());

    // Fetch stories with optional filters
    const where: Record<string, unknown> = { status: { in: statuses } };
    if (epicId) where.epicId = epicId;

    const stories = await prisma.story.findMany({
      where,
      orderBy: [
        { priority: 'asc' },
        { sortOrder: 'asc' },
      ],
      include: {
        epic: {
          select: { id: true, title: true, status: true, priority: true },
        },
      },
    });

    // Fetch GitHub issue details for stories that have issue numbers
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const storiesWithContext = await Promise.all(
      stories.map(async (story) => {
        let githubIssue = null;
        if (story.githubIssueNumber && GITHUB_TOKEN) {
          try {
            const res = await fetch(
              `https://api.github.com/repos/deblasioluca/deepterm/issues/${story.githubIssueNumber}`,
              {
                headers: {
                  Authorization: `Bearer ${GITHUB_TOKEN}`,
                  Accept: 'application/vnd.github+json',
                },
                next: { revalidate: 300 },
              }
            );
            if (res.ok) {
              const issue = await res.json();
              githubIssue = {
                number: issue.number,
                title: issue.title,
                body: issue.body?.slice(0, 2000) || '',
                state: issue.state,
                labels: issue.labels?.map((l: { name: string }) => l.name) || [],
                url: issue.html_url,
              };
            }
          } catch {
            // GitHub API failure is non-fatal
          }
        }
        return { ...story, githubIssue };
      })
    );

    // Also return active epics for context
    const epics = await prisma.epic.findMany({
      where: { status: { in: ['planned', 'in_progress'] } },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        _count: { select: { stories: true } },
      },
    });

    return NextResponse.json({
      stories: storiesWithContext,
      epics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('AI Dev tasks error:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }
}
