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

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/organizations/[orgId]/members
 * List organization members
 */
export async function GET(
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

    // Verify membership — session-only users are checked by invitedEmail
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        organizationId: orgId,
        status: 'confirmed',
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

    if (!orgUser) {
      return errorResponse('Organization not found or access denied', 404);
    }

    const members = await prisma.organizationUser.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            publicKey: true,
            webUser: {
              select: { plan: true, subscriptionScope: true },
            },
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    // Also fetch org for seat info (admin/owner only)
    const isAdminOrOwner = orgUser.role === 'owner' || orgUser.role === 'admin';
    let orgBilling = null;
    if (isAdminOrOwner) {
      const org = await prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          plan: true,
          seats: true,
          maxMembers: true,
          memberBillingMode: true,
          subscriptionStatus: true,
        },
      });
      if (org) {
        const confirmedCount = members.filter(m => m.status === 'confirmed' || m.status === 'active').length;
        const invitedCount = members.filter(m => m.status === 'invited').length;
        // Only org-covered members consume paid seats
        const orgCoveredSeats = members.filter(
          m => m.seatCoveredByOrg && (m.status === 'confirmed' || m.status === 'invited')
        ).length;
        orgBilling = {
          plan: org.plan,
          seats: org.seats,
          maxMembers: org.maxMembers,
          memberBillingMode: org.memberBillingMode,
          subscriptionStatus: org.subscriptionStatus,
          seatsUsed: orgCoveredSeats,
          confirmedMembers: confirmedCount,
          pendingInvites: invitedCount,
        };
      }
    }

    const response = successResponse({
      members: members.map(m => ({
        id: m.id,
        userId: m.userId,
        email: m.user?.email ?? m.invitedEmail ?? '',
        publicKey: m.user?.publicKey ?? null,
        role: m.role,
        status: m.status,
        plan: m.user?.webUser?.plan ?? 'free',
        subscriptionScope: m.user?.webUser?.subscriptionScope ?? 'none',
        seatCoveredByOrg: m.seatCoveredByOrg,
        invitedAt: m.createdAt.toISOString(),
        confirmedAt: m.confirmedAt ? m.confirmedAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      })),
      ...(orgBilling ? { billing: orgBilling } : {}),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('List members error:', error);
    return errorResponse('Failed to list members', 500);
  }
}
