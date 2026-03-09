import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { sendIdeaReplyEmail } from '@/lib/email';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    include: {
      author: { select: { id: true, name: true, email: true } },
      _count: { select: { votes: true } },
      comments: {
        select: {
          id: true,
          authorType: true,
          authorName: true,
          authorEmail: true,
          message: true,
          visibility: true,
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
      githubIssueNumber: idea.githubIssueNumber,
      authorName: idea.author.name,
      authorEmail: idea.author.email,
      voteCount: idea._count.votes,
      createdAt: idea.createdAt,
      comments: idea.comments,
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const visibility = body?.visibility === 'internal' ? 'internal' : 'public';

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    include: { author: { select: { id: true, name: true, email: true } } },
  });

  if (!idea) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  await prisma.ideaComment.create({
    data: {
      ideaId: params.id,
      authorType: 'admin',
      authorName: session.email,
      authorEmail: session.email,
      message,
      visibility,
    },
  });

  // Send email notification to the idea author for public replies
  if (visibility === 'public' && idea.author.email) {
    sendIdeaReplyEmail({
      userName: idea.author.name || 'there',
      userEmail: idea.author.email,
      ideaTitle: idea.title,
      ideaId: idea.id,
      replyMessage: message,
    }).catch((err) => console.error('[Email] Failed to send idea reply notification:', err));

    // In-app notification
    prisma.userNotification.create({
      data: {
        userId: idea.author.id,
        type: 'admin_reply',
        title: `New reply on: ${idea.title}`,
        message: message.substring(0, 500),
        linkUrl: `/dashboard/ideas/${idea.id}`,
        sourceType: 'idea',
        sourceId: idea.id,
      },
    }).catch((err) => console.error('[Notification] Failed:', err));
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status } = body;

    const idea = await prisma.idea.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json(idea);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json(
      { error: 'Failed to update idea' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.idea.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete idea:', error);
    return NextResponse.json(
      { error: 'Failed to delete idea' },
      { status: 500 }
    );
  }
}
