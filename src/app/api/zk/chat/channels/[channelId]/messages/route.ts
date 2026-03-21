import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/chat/channels/[channelId]/messages?limit=50&before=<cursor>
 * Get messages for a channel with cursor-based pagination.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { channelId } = await params;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50'), 100);
    const before = request.nextUrl.searchParams.get('before');

    // Verify user has access to this channel
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { participants: { select: { userId: true } } },
    });

    if (!channel) return errorResponse('Channel not found', 404);

    // Team channels: verify org membership + team membership. DM channels: verify participation.
    if (channel.type === 'team') {
      const membership = await prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId: channel.organizationId, userId: auth.userId } },
      });
      if (!membership || membership.status !== 'confirmed') {
        return errorResponse('Access denied', 403);
      }
      // If channel is scoped to a team, verify team membership
      if (channel.teamId) {
        const teamMember = await prisma.orgTeamMember.findUnique({
          where: { teamId_userId: { teamId: channel.teamId, userId: auth.userId } },
        });
        if (!teamMember) return errorResponse('Access denied', 403);
      }
    } else {
      const isParticipant = channel.participants.some(p => p.userId === auth.userId);
      if (!isParticipant) return errorResponse('Access denied', 403);
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        channelId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: new Date(before) } } : {}),
      },
      include: {
        sender: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    // Update last read for the requesting user
    await prisma.chatChannelParticipant.upsert({
      where: { channelId_userId: { channelId, userId: auth.userId } },
      update: { lastRead: new Date() },
      create: { channelId, userId: auth.userId, lastRead: new Date() },
    });

    const result = messages.reverse().map(m => ({
      id: m.id,
      channelId: m.channelId,
      senderId: m.senderId,
      senderEmail: m.sender.email,
      content: m.content,
      type: m.type,
      fileId: m.fileId,
      editedAt: m.editedAt?.toISOString() || null,
      createdAt: m.createdAt.toISOString(),
    }));

    const response = successResponse({
      messages: result,
      hasMore: messages.length === limit,
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get messages error:', error);
    return errorResponse('Failed to get messages', 500);
  }
}

/**
 * POST /api/zk/chat/channels/[channelId]/messages
 * Send a message to a channel.
 * Body: { content, type?: "text"|"file"|"system", fileId? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { channelId } = await params;
    const body = await request.json();
    const { content, type, fileId } = body;

    if (!content && type !== 'file') return errorResponse('content is required');

    // Verify channel access
    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      include: { participants: { select: { userId: true } } },
    });
    if (!channel) return errorResponse('Channel not found', 404);

    if (channel.type === 'team') {
      const membership = await prisma.organizationUser.findUnique({
        where: { organizationId_userId: { organizationId: channel.organizationId, userId: auth.userId } },
      });
      if (!membership || membership.status !== 'confirmed') {
        return errorResponse('Access denied', 403);
      }
      if (channel.teamId) {
        const teamMember = await prisma.orgTeamMember.findUnique({
          where: { teamId_userId: { teamId: channel.teamId, userId: auth.userId } },
        });
        if (!teamMember) return errorResponse('Access denied', 403);
      }
    } else {
      const isParticipant = channel.participants.some(p => p.userId === auth.userId);
      if (!isParticipant) return errorResponse('Access denied', 403);
    }

    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        senderId: auth.userId,
        content: content || '',
        type: type || 'text',
        fileId: fileId || null,
      },
      include: {
        sender: { select: { id: true, email: true } },
      },
    });

    // Update channel's updatedAt
    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { updatedAt: new Date() },
    });

    const result = {
      id: message.id,
      channelId: message.channelId,
      senderId: message.senderId,
      senderEmail: message.sender.email,
      content: message.content,
      type: message.type,
      fileId: message.fileId,
      createdAt: message.createdAt.toISOString(),
    };

    const response = successResponse(result, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Send message error:', error);
    return errorResponse('Failed to send message', 500);
  }
}
