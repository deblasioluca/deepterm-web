import { NextRequest, NextResponse } from 'next/server';
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
import { syncNewMemberPlan } from '@/lib/zk/sync-org-plans';

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

    // ── Seat re-check (race condition guard) ──
    // If this invitation was marked as org-covered, re-verify seat availability
    // in case seats were consumed between invite and accept.
    if (membership.seatCoveredByOrg) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: { seats: true },
      });

      // Count org-covered seats excluding this membership (it's already counted as 'invited')
      const orgCoveredSeats = await prisma.organizationUser.count({
        where: {
          organizationId: orgId,
          status: { in: ['confirmed', 'invited'] },
          seatCoveredByOrg: true,
          id: { not: membership.id },
        },
      });

      if (org && orgCoveredSeats >= org.seats) {
        const response = NextResponse.json(
          {
            error: 'seats_exhausted',
            message: `All ${org.seats} seats are in use. The organization needs to ` +
              `purchase additional seats before you can join.`,
            seatsUsed: orgCoveredSeats,
            seatsTotal: org.seats,
          },
          { status: 402 }
        );
        return addCorsHeaders(response);
      }
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

    // Also add user to the default team if one exists.
    // Session-only users are added by invitedEmail (userId stays null).
    const defaultTeam = await prisma.orgTeam.findFirst({
      where: { organizationId: orgId, isDefault: true },
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

    // Sync org plan to the newly accepted member (fire-and-forget)
    if (!sessionOnly && auth.userId) {
      syncNewMemberPlan(orgId, auth.userId).catch(() => {});
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
