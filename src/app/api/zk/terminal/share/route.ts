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
 * GET /api/zk/terminal/share?orgId=xxx
 * List active shared terminal sessions for an organization.
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

    const sessions = await prisma.sharedTerminalSession.findMany({
      where: { organizationId: orgId, isActive: true },
      include: {
        owner: { select: { id: true, email: true } },
        participants: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const result = sessions.map(s => ({
      id: s.id,
      ownerId: s.ownerId,
      ownerEmail: s.owner.email,
      sessionName: s.sessionName,
      participants: s.participants.map(p => ({
        userId: p.userId,
        email: p.user.email,
        canWrite: p.canWrite,
        status: p.status,
        joinedAt: p.joinedAt?.toISOString() || null,
      })),
      createdAt: s.createdAt.toISOString(),
    }));

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List shared sessions error:', error);
    return errorResponse('Failed to list shared sessions', 500);
  }
}

/**
 * POST /api/zk/terminal/share
 * Create a new shared terminal session.
 * Body: { orgId, sessionName, participantIds?: [{userId, canWrite}] }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const body = await request.json();
    const { orgId, sessionName, participantIds } = body;

    if (!orgId) return errorResponse('orgId is required');

    // Verify membership
    const membership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: orgId, userId: auth.userId } },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    const session = await prisma.sharedTerminalSession.create({
      data: {
        ownerId: auth.userId,
        organizationId: orgId,
        sessionName: sessionName || '',
        participants: participantIds?.length ? {
          create: participantIds.map((p: { userId: string; canWrite?: boolean }) => ({
            userId: p.userId,
            canWrite: p.canWrite || false,
            status: 'invited',
          })),
        } : undefined,
      },
      include: {
        participants: {
          include: { user: { select: { id: true, email: true } } },
        },
      },
    });

    const response = successResponse({
      id: session.id,
      sessionName: session.sessionName,
      participants: session.participants.map(p => ({
        userId: p.userId,
        email: p.user.email,
        canWrite: p.canWrite,
        status: p.status,
      })),
    }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create shared session error:', error);
    return errorResponse('Failed to create shared session', 500);
  }
}
