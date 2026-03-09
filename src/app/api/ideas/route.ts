import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notifyNewIdea } from '@/lib/node-red';
import { triageIdea } from '@/lib/ai-triage';

// GET all ideas
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;

    const ideas = await prisma.idea.findMany({
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
        votes: true,
        _count: {
          select: {
            votes: true,
            comments: { where: { visibility: 'public' } },
          },
        },
        comments: {
          where: { visibility: 'public' },
          select: { authorType: true, message: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Collect issue numbers already linked to ideas
    const linkedIssueNumbers = new Set(
      ideas.filter(i => i.githubIssueNumber).map(i => i.githubIssueNumber!)
    );

    // Transform to include vote count and hasVoted
    const transformedIdeas = ideas.map((idea) => {
      // Check if the last public comment is from AI and not a triage completion
      const lastComment = idea.comments[0];
      const needsReply = lastComment?.authorType === 'ai' && !lastComment.message.startsWith('[TRIAGE_COMPLETE]');

      return {
        id: idea.id,
        title: idea.title,
        description: idea.description,
        status: idea.status,
        votes: idea._count.votes,
        hasVoted: userId ? idea.votes.some((v) => v.userId === userId) : false,
        commentCount: idea._count.comments,
        needsReply: userId === idea.author.id ? needsReply : false,
        author: idea.author.name,
        authorId: idea.author.id,
        createdAt: idea.createdAt.toISOString().split('T')[0],
      };
    });

    // Find open GitHub issues not already linked to an Idea — show as backlog items
    const ghIssues = await prisma.githubIssue.findMany({
      where: {
        state: 'open',
        NOT: { number: { in: Array.from(linkedIssueNumbers) } },
      },
      orderBy: { githubCreatedAt: 'desc' },
    });

    // Map GitHub issue state to idea status — check if a Story references this issue
    const storiesWithIssues = await prisma.story.findMany({
      where: { githubIssueNumber: { in: ghIssues.map(i => i.number) } },
      select: { githubIssueNumber: true, status: true },
    });
    const storyStatusByIssue = new Map(
      storiesWithIssues.map(s => [s.githubIssueNumber!, s.status])
    );

    const storyStatusToIdeaStatus = (status: string): string => {
      switch (status) {
        case 'in_progress': return 'in-progress';
        case 'done':
        case 'released': return 'launched';
        default: return 'planned';
      }
    };

    // Create synthetic idea entries from GitHub issues
    const syntheticIdeas = ghIssues.map((issue) => {
      const rawDesc = issue.body || '';
      const description = rawDesc.length > 200
        ? rawDesc.slice(0, 200).replace(/\s+\S*$/, '') + '...'
        : rawDesc;
      const storyStatus = storyStatusByIssue.get(issue.number);

      return {
        id: `gh-${issue.number}`,
        title: issue.title,
        description,
        status: storyStatus ? storyStatusToIdeaStatus(storyStatus) : 'planned',
        votes: 0,
        hasVoted: false,
        commentCount: 0,
        author: 'DeepTerm Team',
        authorId: null,
        createdAt: issue.githubCreatedAt.toISOString().split('T')[0],
      };
    });

    return NextResponse.json([...transformedIdeas, ...syntheticIdeas]);
  } catch (error) {
    console.error('Failed to fetch ideas:', error);
    return NextResponse.json(
      { error: 'Failed to fetch ideas' },
      { status: 500 }
    );
  }
}

// POST new idea
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { title, description } = await request.json();

    if (!title || !description) {
      return NextResponse.json(
        { error: 'Title and description are required' },
        { status: 400 }
      );
    }

    const idea = await prisma.idea.create({
      data: {
        title,
        description,
        authorId: session.user.id,
        status: 'consideration',
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    // Auto-vote for the author
    await prisma.vote.create({
      data: {
        userId: session.user.id,
        ideaId: idea.id,
      },
    });

    // Notify Node-RED → WhatsApp (fire-and-forget)
    notifyNewIdea({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      authorEmail: session.user.email || undefined,
    });

    // Fire-and-forget AI triage
    triageIdea(idea.id).catch((err) => console.error('[AI Triage] Fire-and-forget error:', err));

    return NextResponse.json({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      status: idea.status,
      votes: 1,
      hasVoted: true,
      commentCount: 0,
      author: idea.author.name,
      authorId: idea.author.id,
      createdAt: idea.createdAt.toISOString().split('T')[0],
    });
  } catch (error) {
    console.error('Failed to create idea:', error);
    return NextResponse.json(
      { error: 'Failed to create idea' },
      { status: 500 }
    );
  }
}
