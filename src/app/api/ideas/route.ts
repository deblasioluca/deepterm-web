import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notifyNewIdea } from '@/lib/node-red';

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
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform to include vote count and hasVoted
    const transformedIdeas = ideas.map((idea) => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      status: idea.status,
      votes: idea._count.votes,
      hasVoted: userId ? idea.votes.some((v) => v.userId === userId) : false,
      commentCount: 0, // Placeholder - could add comments model later
      author: idea.author.name,
      authorId: idea.author.id,
      createdAt: idea.createdAt.toISOString().split('T')[0],
    }));

    return NextResponse.json(transformedIdeas);
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
