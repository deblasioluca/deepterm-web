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
 * GET /api/zk/chat/channels?orgId=xxx
 * List chat channels for an organization that the user participates in.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const orgId = request.nextUrl.searchParams.get('orgId');
    if (!orgId) return errorResponse('orgId query parameter required');

    // Verify membership
    const membership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    // Get team channels + DM channels the user participates in
    const channels = await prisma.chatChannel.findMany({
      where: {
        organizationId: orgId,
        OR: [
          { type: 'team' },
          { participants: { some: { userId: auth.userId } } },
        ],
      },
      include: {
        participants: {
          include: { user: { select: { id: true, email: true } } },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const result = channels.map(ch => ({
      id: ch.id,
      type: ch.type,
      name: ch.name,
      organizationId: ch.organizationId,
      participants: ch.participants.map(p => ({
        userId: p.userId,
        email: p.user.email,
        isMuted: p.isMuted,
        lastRead: p.lastRead?.toISOString() || null,
      })),
      messageCount: ch._count.messages,
      createdAt: ch.createdAt.toISOString(),
      updatedAt: ch.updatedAt.toISOString(),
    }));

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List channels error:', error);
    return errorResponse('Failed to list channels', 500);
  }
}

/**
 * POST /api/zk/chat/channels
 * Create a new chat channel (team or DM).
 * Body: { orgId, type: "team"|"dm", name?, participantIds?: string[] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const body = await request.json();
    const { orgId, type, name, participantIds } = body;

    if (!orgId) return errorResponse('orgId is required');
    if (!type || !['team', 'dm'].includes(type)) {
      return errorResponse('type must be "team" or "dm"');
    }

    // Verify membership
    const membership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    // For DM: check if a DM channel already exists between these two users
    if (type === 'dm' && participantIds?.length === 1) {
      const otherUserId = participantIds[0];
      const existing = await prisma.chatChannel.findFirst({
        where: {
          organizationId: orgId,
          type: 'dm',
          AND: [
            { participants: { some: { userId: auth.userId } } },
            { participants: { some: { userId: otherUserId } } },
          ],
        },
      });
      if (existing) {
        const response = successResponse({ id: existing.id, existing: true });
        return addCorsHeaders(response);
      }
    }

    // Create the channel
    const participantData = [
      { userId: auth.userId },
      ...(participantIds || []).map((id: string) => ({ userId: id })),
    ];

    const channel = await prisma.chatChannel.create({
      data: {
        organizationId: orgId,
        type,
        name: type === 'team' ? (name || 'General') : null,
        createdBy: auth.userId,
        participants: { create: participantData },
      },
    });

    const response = successResponse({ id: channel.id }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create channel error:', error);
    return errorResponse('Failed to create channel', 500);
  }
}
