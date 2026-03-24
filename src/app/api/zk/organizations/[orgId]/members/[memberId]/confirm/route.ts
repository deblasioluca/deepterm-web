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
 * POST /api/zk/organizations/[orgId]/members/[memberId]/confirm
 * Confirm a user's membership (accept invitation)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const auth = await getAuthFromRequestOrSession(request);

    if (!auth || isSessionOnlyAuth(auth)) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId, memberId } = await params;
    const body = await request.json();
    const { encryptedOrgKey } = body;

    // Get the membership
    const member = await prisma.organizationUser.findFirst({
      where: {
        id: memberId,
        organizationId: orgId,
      },
    });

    if (!member) {
      return errorResponse('Membership not found', 404);
    }

    // Allow self-confirmation OR admin/owner confirmation
    if (member.userId !== auth.userId) {
      // Check if the caller is an admin or owner of this org
      const callerMembership = await prisma.organizationUser.findFirst({
        where: {
          userId: auth.userId,
          organizationId: orgId,
          status: 'confirmed',
          role: { in: ['owner', 'admin'] },
        },
      });
      if (!callerMembership) {
        return errorResponse('Only org owners/admins can confirm other members', 403);
      }
      // Ensure the member has a linked user account before confirming
      if (!member.userId) {
        return errorResponse('Cannot confirm membership: user has not registered yet', 400);
      }
    }

    // Check if already confirmed
    if (member.status === 'confirmed') {
      return errorResponse('Membership already confirmed', 409);
    }

    // Check if invitation was revoked
    if (member.status === 'revoked') {
      return errorResponse('Invitation has been revoked', 403);
    }

    // Update to confirmed status
    await prisma.organizationUser.update({
      where: { id: memberId },
      data: {
        status: OrganizationUserStatus.CONFIRMED,
        confirmedAt: new Date(),
        encryptedOrgKey: encryptedOrgKey || member.encryptedOrgKey,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'user_confirmed',
      targetType: 'user',
      targetId: member.userId || memberId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    // Sync org plan to the newly confirmed member (fire-and-forget).
    // Only sync for org-covered members — self-paying members keep their own plan.
    if (member.userId && member.seatCoveredByOrg) {
      syncNewMemberPlan(orgId, member.userId).catch(() => {});
    }

    // Fire-and-forget MS Teams notification
    import('@/lib/ms-teams').then(({ notifyTeamsMemberJoined }) => {
      // Look up org name for the notification
      prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }).then(org => {
        notifyTeamsMemberJoined({
          email: member.invitedEmail || 'unknown',
          role: member.role,
          orgName: org?.name,
        });
      }).catch(() => { /* ignore */ });
    }).catch(() => { /* ignore */ });

    const response = successResponse({ message: 'Membership confirmed successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Confirm membership error:', error);
    return errorResponse('Failed to confirm membership', 500);
  }
}
