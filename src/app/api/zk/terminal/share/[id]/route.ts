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
 * GET /api/zk/terminal/share/[id]
 * Get details of a shared terminal session.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const session = await prisma.sharedTerminalSession.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, email: true } },
        participants: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });
    if (!session) return errorResponse('Session not found', 404);

    // Verify user is owner or participant
    const isOwner = session.ownerId === auth.userId;
    const isParticipant = session.participants.some(p => p.userId === auth.userId);
    if (!isOwner && !isParticipant) {
      return errorResponse('Access denied', 403);
    }

    const response = successResponse({
      id: session.id,
      ownerId: session.ownerId,
      ownerEmail: session.owner.email,
      sessionName: session.sessionName,
      isActive: session.isActive,
      participants: session.participants.map(p => ({
        userId: p.userId,
        email: p.user.email,
        canWrite: p.canWrite,
        status: p.status,
        joinedAt: p.joinedAt?.toISOString() || null,
      })),
      createdAt: session.createdAt.toISOString(),
      endedAt: session.endedAt?.toISOString() || null,
    });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get shared session error:', error);
    return errorResponse('Failed to get session', 500);
  }
}

/**
 * DELETE /api/zk/terminal/share/[id]
 * End a shared terminal session (owner only).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const session = await prisma.sharedTerminalSession.findUnique({
      where: { id: params.id },
    });
    if (!session) return errorResponse('Session not found', 404);
    if (session.ownerId !== auth.userId) {
      return errorResponse('Only the session owner can end it', 403);
    }

    await prisma.sharedTerminalSession.update({
      where: { id: params.id },
      data: { isActive: false, endedAt: new Date() },
    });

    // Mark all participants as left
    await prisma.sharedSessionParticipant.updateMany({
      where: { sessionId: params.id, status: { not: 'left' } },
      data: { status: 'left', leftAt: new Date() },
    });

    const response = successResponse({ ok: true });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('End shared session error:', error);
    return errorResponse('Failed to end session', 500);
  }
}
