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

    // Also add user to the default team (or first team) if one exists.
    // Session-only users are added by invitedEmail (userId stays null).
    const defaultTeam = await prisma.orgTeam.findFirst({
      where: { organizationId: orgId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    if (defaultTeam) {
      if (sessionOnly) {
        // Check by invitedEmail for session-only users
        const existingTeamMember = await prisma.orgTeamMember.findFirst({
          where: {
            teamId: defaultTeam.id,
            invitedEmail: auth.email,
          },
        });

        if (!existingTeamMember) {
          await prisma.orgTeamMember.create({
            data: {
              teamId: defaultTeam.id,
              invitedEmail: auth.email,
              role: membership.role,
            },
          });
        }
      } else {
        // Check by userId for full JWT users
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

    // Audit log — skip userId/targetId for session-only users to avoid
    // writing a NextAuth User.id into the ZKUser.id FK column.
    const auditUserId = sessionOnly ? undefined : auth.userId;
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
