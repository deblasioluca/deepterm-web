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
  OrganizationUserStatus,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/organizations/[orgId]/accept
 * Accept a pending organization invitation. The current user must have
 * an OrganizationUser record with status="invited" for this org.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;

    // Find the user's pending invitation for this org
    const membership = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'invited',
      },
    });

    if (!membership) {
      return errorResponse('No pending invitation found for this organization', 404);
    }

    // Update status to confirmed and clear the invitation token
    await prisma.organizationUser.update({
      where: { id: membership.id },
      data: {
        status: OrganizationUserStatus.CONFIRMED,
        confirmedAt: new Date(),
        token: null,
      },
    });

    // Also add user to the default team if one exists
    const defaultTeam = await prisma.orgTeam.findFirst({
      where: {
        organizationId: orgId,
        isDefault: true,
      },
    });

    if (defaultTeam) {
      // Check if already a member
      const existingTeamMember = await prisma.orgTeamMember.findFirst({
        where: {
          teamId: defaultTeam.id,
          userId: auth.userId,
        },
      });

      if (!existingTeamMember) {
        await prisma.orgTeamMember.create({
          data: {
            teamId: defaultTeam.id,
            userId: auth.userId,
            role: membership.role,
          },
        });
      }
    }

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'invitation_accepted',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Invitation accepted successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Accept invitation error:', error);
    return errorResponse('Failed to accept invitation', 500);
  }
}
