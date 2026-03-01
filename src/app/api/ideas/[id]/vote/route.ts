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
      
      // ── Vote threshold → WhatsApp notification ──
      const VOTE_THRESHOLD = 5;
      if (voteCount === VOTE_THRESHOLD) {
        try {
          await fetch(`${process.env.NODE_RED_URL || 'http://192.168.1.30:1880'}/deepterm/idea-popular`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'idea-popular',
              id: idea.id,
              title: idea.title,
              voteCount,
              threshold: VOTE_THRESHOLD,
              url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://deepterm.net'}/dashboard/ideas`,
            }),
          });
        } catch (err) {
          console.error('Failed to notify Node-RED (idea-popular):', err);
        }
      }

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
