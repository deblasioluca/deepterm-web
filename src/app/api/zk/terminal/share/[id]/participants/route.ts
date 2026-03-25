import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequestOrSession,
  isSessionOnlyAuth,
  createAuditLog,
  getClientIP,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * PUT /api/zk/terminal/share/[id]/participants
 * Add/update/remove participants in a shared session.
 * Body: { action: "add"|"update"|"remove"|"join"|"leave", userId, canWrite? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);
    if (!auth) return errorResponse('Unauthorized', 401);
    if (isSessionOnlyAuth(auth)) return errorResponse('Vault setup required', 403);

    const { id } = await params;
    const body = await request.json();
    const { action, userId, canWrite } = body;

    if (!action) return errorResponse('action is required');

    const session = await prisma.sharedTerminalSession.findUnique({
      where: { id },
    });
    if (!session) return errorResponse('Session not found', 404);
    if (!session.isActive) return errorResponse('Session is no longer active');

    switch (action) {
      case 'add': {
        // Only owner can add participants
        if (session.ownerId !== auth.userId) {
          return errorResponse('Only the session owner can add participants', 403);
        }
        if (!userId) return errorResponse('userId is required');

        await prisma.sharedSessionParticipant.upsert({
          where: { sessionId_userId: { sessionId: id, userId } },
          update: { canWrite: canWrite ?? false, status: 'invited' },
          create: {
            sessionId: id,
            userId,
            canWrite: canWrite ?? false,
            status: 'invited',
          },
        });
        break;
      }
      case 'update': {
        // Only owner can update permissions
        if (session.ownerId !== auth.userId) {
          return errorResponse('Only the session owner can update permissions', 403);
        }
        if (!userId) return errorResponse('userId is required');

        await prisma.sharedSessionParticipant.update({
          where: { sessionId_userId: { sessionId: id, userId } },
          data: { canWrite: canWrite ?? false },
        });
        break;
      }
      case 'remove': {
        // Only owner can remove
        if (session.ownerId !== auth.userId) {
          return errorResponse('Only the session owner can remove participants', 403);
        }
        if (!userId) return errorResponse('userId is required');

        await prisma.sharedSessionParticipant.update({
          where: { sessionId_userId: { sessionId: id, userId } },
          data: { status: 'left', leftAt: new Date() },
        });
        break;
      }
      case 'join': {
        // Participant joins
        const participant = await prisma.sharedSessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId: id, userId: auth.userId } },
        });
        if (!participant || participant.status === 'left') {
          return errorResponse('Not invited to this session', 403);
        }
        await prisma.sharedSessionParticipant.update({
          where: { sessionId_userId: { sessionId: id, userId: auth.userId } },
          data: { status: 'joined', joinedAt: new Date() },
        });
        break;
      }
      case 'leave': {
        // Participant leaves
        await prisma.sharedSessionParticipant.update({
          where: { sessionId_userId: { sessionId: id, userId: auth.userId } },
          data: { status: 'left', leftAt: new Date() },
        });
        break;
      }
      case 'request_write': {
        // Participant requests write access from owner
        const participant = await prisma.sharedSessionParticipant.findUnique({
          where: { sessionId_userId: { sessionId: id, userId: auth.userId } },
        });
        if (!participant || participant.status === 'left') {
          return errorResponse('Not a participant in this session', 403);
        }
        if (participant.canWrite) {
          return errorResponse('You already have write access');
        }
        // For now, just log the request. In a full implementation this would
        // send a notification to the session owner via WebSocket.
        break;
      }
      default:
        return errorResponse('Invalid action. Use: add, update, remove, join, leave, request_write');
    }

    await createAuditLog({
      userId: auth.userId,
      organizationId: session.organizationId,
      eventType: 'terminal_participant_updated',
      targetType: 'terminal_session',
      targetId: id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { action, targetUserId: userId || auth.userId },
    });

    const response = successResponse({ ok: true });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Manage participants error:', error);
    return errorResponse('Failed to manage participants', 500);
  }
}
