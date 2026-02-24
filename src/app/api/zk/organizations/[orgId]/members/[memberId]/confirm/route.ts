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
  OrganizationUserStatus,
} from '@/lib/zk';

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
    const auth = getAuthFromRequest(request);

    if (!auth) {
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

    // User can only confirm their own invitation
    if (member.userId !== auth.userId) {
      return errorResponse('You can only confirm your own invitation', 403);
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
        encryptedOrgKey: encryptedOrgKey || member.encryptedOrgKey,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'user_confirmed',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Membership confirmed successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Confirm membership error:', error);
    return errorResponse('Failed to confirm membership', 500);
  }
}
