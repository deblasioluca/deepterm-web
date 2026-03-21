import { NextRequest, NextResponse } from 'next/server';
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
 * GET /api/zk/teams/[teamId]
 * Get a specific team's details.
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

    const team = await prisma.orgTeam.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: { select: { id: true, email: true } } },
        },
        _count: { select: { chatChannels: true, sharedSessions: true } },
      },
    });

    if (!team) {
      return errorResponse('Team not found', 404);
    }

    const result = {
      id: team.id,
      name: team.name,
      description: team.description,
      organizationId: team.organizationId,
      ownerId: team.ownerId,
      isDefault: team.isDefault,
      allowFederation: team.allowFederation,
      members: team.members.map(m => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      })),
      channelCount: team._count.chatChannels,
      sessionCount: team._count.sharedSessions,
      createdAt: team.createdAt.toISOString(),
      updatedAt: team.updatedAt.toISOString(),
    };

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get team error:', error);
    return errorResponse('Failed to get team', 500);
  }
}

/**
 * PUT /api/zk/teams/[teamId]
 * Update a team's details (owner/admin only).
 * Body: { name?, description?, allowFederation? }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { teamId } = await params;
    const body = await request.json();
    const { name, description, allowFederation } = body;

    // Verify the user is team owner or admin
    const membership = await prisma.orgTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId: auth.userId } },
    });
    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return errorResponse('Only team owners and admins can update team settings', 403);
    }

    const team = await prisma.orgTeam.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) return errorResponse('Team not found', 404);

    await prisma.orgTeam.update({
      where: { id: teamId },
      data: {
        ...(name !== undefined && name !== null && { name: String(name).trim() }),
        ...(description !== undefined && { description }),
        ...(allowFederation !== undefined && { allowFederation }),
      },
    });

    await createAuditLog({
      userId: auth.userId,
      organizationId: team.organizationId,
      eventType: 'team_updated',
      targetType: 'team',
      targetId: teamId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Team updated successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update team error:', error);
    return errorResponse('Failed to update team', 500);
  }
}

/**
 * DELETE /api/zk/teams/[teamId]
 * Delete a team and all its associated data (owner only).
 * Cascade deletes: team members, chat channels, shared sessions.
 * Cannot delete the default team.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const auth = getAuthFromRequest(request);
    if (!auth) return errorResponse('Unauthorized', 401);

    const { teamId } = await params;

    // Get team details
    const team = await prisma.orgTeam.findUnique({
      where: { id: teamId },
      select: { ownerId: true, organizationId: true, isDefault: true, name: true },
    });

    if (!team) {
      return errorResponse('Team not found', 404);
    }

    // Only the team owner can delete the team
    if (team.ownerId !== auth.userId) {
      // Also allow org owners to delete any team
      const orgMembership = await prisma.organizationUser.findUnique({
        where: {
          organizationId_userId: {
            organizationId: team.organizationId,
            userId: auth.userId,
          },
        },
      });
      if (!orgMembership || orgMembership.role !== 'owner') {
        return errorResponse('Only the team owner or organization owner can delete a team', 403);
      }
    }

    // Cannot delete the default team
    if (team.isDefault) {
      return errorResponse('Cannot delete the default team. Delete the organization instead.', 400);
    }

    // Delete team (cascades will handle members, chat channels, shared sessions)
    await prisma.orgTeam.delete({
      where: { id: teamId },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: team.organizationId,
      eventType: 'team_deleted',
      targetType: 'team',
      targetId: teamId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { teamName: team.name },
    });

    return addCorsHeaders(new NextResponse(null, { status: 204 }));
  } catch (error) {
    console.error('Delete team error:', error);
    return errorResponse('Failed to delete team', 500);
  }
}
