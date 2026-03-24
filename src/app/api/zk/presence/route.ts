import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequestOrSession,
  isSessionOnlyAuth,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/presence
 * Update heartbeat for the authenticated user across all their orgs.
 * Body: { status?: "online" | "away", deviceInfo?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthFromRequestOrSession(request);
    if (!auth) return errorResponse('Unauthorized', 401);
    if (isSessionOnlyAuth(auth)) return errorResponse('Vault setup required', 403);

    const body = await request.json().catch(() => ({}));
    const status = body.status || 'online';
    const deviceInfo = body.deviceInfo ? JSON.stringify(body.deviceInfo) : null;

    // Find all orgs this user belongs to
    const memberships = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });

    // Upsert presence for each org
    for (const m of memberships) {
      await prisma.teamPresence.upsert({
        where: {
          userId_organizationId: {
            userId: auth.userId,
            organizationId: m.organizationId,
          },
        },
        update: {
          status,
          lastHeartbeat: new Date(),
          deviceInfo,
        },
        create: {
          userId: auth.userId,
          organizationId: m.organizationId,
          status,
          deviceInfo,
        },
      });
    }

    const response = successResponse({ ok: true });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Presence heartbeat error:', error);
    return errorResponse('Failed to update presence', 500);
  }
}
