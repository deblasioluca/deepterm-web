import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
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
 * GET /api/zk/teams/[teamId]/members
 * List members of a team.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { teamId } = await params;

    // Verify the user is a member of this team
    const membership = await prisma.orgTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId: auth.userId } },
    });
    if (!membership) {
      return errorResponse('Not a member of this team', 403);
    }

    const members = await prisma.orgTeamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, email: true } } },
      orderBy: { joinedAt: 'asc' },
    });

    const result = members.map(m => ({
      id: m.id,
      userId: m.userId,
      email: m.user?.email ?? m.invitedEmail ?? '',
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
    }));

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List team members error:', error);
    return errorResponse('Failed to list team members', 500);
  }
}

/**
 * POST /api/zk/teams/[teamId]/members
 * Add a member to a team.
 * Body: { userId, role?: "member" | "admin" }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { teamId } = await params;
    const body = await request.json();
    const { userId, role } = body;

    if (!userId) return errorResponse('userId is required');

    // Verify the requester is team owner or admin
    const requesterMembership = await prisma.orgTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId: auth.userId } },
    });
    if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
      return errorResponse('Only team owners and admins can add members', 403);
    }

    // Verify the target user is in the same organization
    const team = await prisma.orgTeam.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) return errorResponse('Team not found', 404);

    const orgMembership = await prisma.organizationUser.findUnique({
      where: { organizationId_userId: { organizationId: team.organizationId, userId } },
    });
    if (!orgMembership || orgMembership.status !== 'confirmed') {
      return errorResponse('User is not a confirmed member of the organization', 400);
    }

    // Check for existing membership
    const existing = await prisma.orgTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (existing) {
      return errorResponse('User is already a member of this team');
    }

    const validRoles = ['member', 'admin'];
    const memberRole = role && validRoles.includes(role) ? role : 'member';

    const member = await prisma.orgTeamMember.create({
      data: { teamId, userId, role: memberRole },
    });

    await createAuditLog({
      userId: auth.userId,
      organizationId: team.organizationId,
      eventType: 'team_member_added',
      targetType: 'team',
      targetId: teamId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { addedUserId: userId, role: memberRole },
    });

    const response = successResponse({ id: member.id }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Add team member error:', error);
    return errorResponse('Failed to add team member', 500);
  }
}

/**
 * DELETE /api/zk/teams/[teamId]/members
 * Remove a member from a team.
 * Body: { userId }
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { teamId } = await params;
    const body = await request.json();
    const { userId } = body;

    if (!userId) return errorResponse('userId is required');

    // Users can remove themselves; otherwise need owner/admin role
    if (userId !== auth.userId) {
      const requesterMembership = await prisma.orgTeamMember.findUnique({
        where: { teamId_userId: { teamId, userId: auth.userId } },
      });
      if (!requesterMembership || !['owner', 'admin'].includes(requesterMembership.role)) {
        return errorResponse('Only team owners and admins can remove members', 403);
      }
    }

    // Cannot remove the team owner
    const team = await prisma.orgTeam.findUnique({
      where: { id: teamId },
      select: { ownerId: true, organizationId: true },
    });
    if (team && team.ownerId === userId) {
      return errorResponse('Cannot remove the team owner. Transfer ownership first.', 400);
    }

    await prisma.orgTeamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    });

    await createAuditLog({
      userId: auth.userId,
      organizationId: team?.organizationId,
      eventType: 'team_member_removed',
      targetType: 'team',
      targetId: teamId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { removedUserId: userId },
    });

    const response = successResponse({ removed: true });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Remove team member error:', error);
    return errorResponse('Failed to remove team member', 500);
  }
}
