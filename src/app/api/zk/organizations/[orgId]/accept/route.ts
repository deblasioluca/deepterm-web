import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  getAuthFromRequestOrSession,
  isSessionOnlyAuth,
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
    const auth = await getAuthFromRequestOrSession(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;
    const sessionOnly = isSessionOnlyAuth(auth);

    // Find the user's pending invitation for this org.
    // Session-only users (no ZKUser) are matched by invitedEmail;
    // full JWT users are matched by userId with email fallback.
    const membership = await prisma.organizationUser.findFirst({
      where: {
        organizationId: orgId,
        status: 'invited',
        ...(sessionOnly
          ? { invitedEmail: auth.email }
          : {
              OR: [
                { userId: auth.userId },
                ...(auth.email ? [{ invitedEmail: auth.email }] : []),
              ],
            }),
      },
    });

    if (!membership) {
      return errorResponse('No pending invitation found for this organization', 404);
    }

    // Update status to confirmed and clear the invitation token.
    // For session-only users, userId stays null until they create vault keys.
    await prisma.organizationUser.update({
      where: { id: membership.id },
      data: {
        status: OrganizationUserStatus.CONFIRMED,
        confirmedAt: new Date(),
        token: null,
        // Link ZKUser.id if available (not for session-only users)
        ...(!sessionOnly && !membership.userId ? { userId: auth.userId } : {}),
      },
    });

    // Also add user to the default team if one exists
    // (skip for session-only users — they'll be added when they create vault keys)
    if (!sessionOnly) {
      const defaultTeam = await prisma.orgTeam.findFirst({
        where: {
          organizationId: orgId,
          isDefault: true,
        },
      });

      if (defaultTeam) {
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
    }

    // Audit log
    const auditUserId = sessionOnly ? auth.webUserId : auth.userId;
    await createAuditLog({
      userId: auditUserId,
      organizationId: orgId,
      eventType: 'invitation_accepted',
      targetType: 'user',
      targetId: auditUserId,
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
