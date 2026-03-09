import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  const userId = session?.user?.id;

  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, name: true } },
      votes: true,
      _count: { select: { votes: true } },
      comments: {
        where: { visibility: 'public' },
        select: {
          id: true,
          authorType: true,
          authorName: true,
          message: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!idea) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    idea: {
      id: idea.id,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      status: idea.status,
      votes: idea._count.votes,
      hasVoted: userId ? idea.votes.some((v) => v.userId === userId) : false,
      author: idea.author.name,
      authorId: idea.author.id,
      githubIssueNumber: idea.githubIssueNumber,
      createdAt: idea.createdAt.toISOString(),
      comments: idea.comments,
    },
  });
}
