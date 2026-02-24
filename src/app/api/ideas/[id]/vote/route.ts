import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST toggle vote
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ideaId = params.id;
    const userId = session.user.id;

    // Check if idea exists
    const idea = await prisma.idea.findUnique({
      where: { id: ideaId },
    });

    if (!idea) {
      return NextResponse.json({ error: 'Idea not found' }, { status: 404 });
    }

    // Check existing vote
    const existingVote = await prisma.vote.findUnique({
      where: {
        userId_ideaId: {
          userId,
          ideaId,
        },
      },
    });

    if (existingVote) {
      // Remove vote
      await prisma.vote.delete({
        where: { id: existingVote.id },
      });
      
      const voteCount = await prisma.vote.count({
        where: { ideaId },
      });

      return NextResponse.json({ 
        voted: false, 
        votes: voteCount 
      });
    } else {
      // Add vote
      await prisma.vote.create({
        data: {
          userId,
          ideaId,
        },
      });

      const voteCount = await prisma.vote.count({
        where: { ideaId },
      });

      return NextResponse.json({ 
        voted: true, 
        votes: voteCount 
      });
    }
  } catch (error) {
    console.error('Failed to toggle vote:', error);
    return NextResponse.json(
      { error: 'Failed to toggle vote' },
      { status: 500 }
    );
  }
}
