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
 * GET /api/zk/presence/org/[orgId]
 * Get presence status for all members of an organization.
 * Marks users as offline if last heartbeat > 2 minutes ago.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { orgId } = await params;

    // Verify user is a member of this org
    const membership = await prisma.organizationUser.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: auth.userId,
        },
      },
    });
    if (!membership || membership.status !== 'confirmed') {
      return errorResponse('Not a member of this organization', 403);
    }

    // Get all confirmed members with their presence
    const members = await prisma.organizationUser.findMany({
      where: { organizationId: orgId, status: 'confirmed' },
      include: {
        user: { select: { id: true, email: true } },
      },
    });

    const presenceRecords = await prisma.teamPresence.findMany({
      where: { organizationId: orgId },
    });

    const presenceMap = new Map(
      presenceRecords.map(p => [p.userId, p])
    );

    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);

    const result = members.map(m => {
      const presence = presenceMap.get(m.userId);
      let status = 'offline';
      if (presence) {
        status = presence.lastHeartbeat > twoMinutesAgo ? presence.status : 'offline';
      }
      return {
        userId: m.userId,
        email: m.user.email,
        role: m.role,
        status,
        lastHeartbeat: presence?.lastHeartbeat?.toISOString() || null,
        deviceInfo: presence?.deviceInfo ? (() => { try { return JSON.parse(presence.deviceInfo); } catch { return null; } })() : null,
      };
    });

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get org presence error:', error);
    return errorResponse('Failed to get presence', 500);
  }
}
