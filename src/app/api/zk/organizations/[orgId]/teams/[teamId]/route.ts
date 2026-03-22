import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  getAuthFromRequestOrSession,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
  createAuditLog,
  getClientIP,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * DELETE /api/zk/organizations/[orgId]/teams/[teamId]
 * Delete a team (owner/admin only). Cannot delete default team.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; teamId: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { orgId, teamId } = await params;

    // Verify admin/owner
    const orgUser = await prisma.organizationUser.findFirst({
      where: { userId: auth.userId, organizationId: orgId, status: 'confirmed' },
    });
    if (!orgUser) return errorResponse('Organization not found or access denied', 404);
    if (orgUser.role !== 'owner' && orgUser.role !== 'admin') {
      return errorResponse('Only owners and admins can delete teams', 403);
    }

    const team = await prisma.orgTeam.findFirst({
      where: { id: teamId, organizationId: orgId },
    });
    if (!team) return errorResponse('Team not found', 404);
    if (team.isDefault) return errorResponse('Cannot delete the default team', 400);

    await prisma.orgTeam.delete({ where: { id: teamId } });

    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'team_deleted',
      targetType: 'team',
      targetId: teamId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ deleted: true });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Delete team error:', error);
    return errorResponse('Failed to delete team', 500);
  }
}
