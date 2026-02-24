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
 * POST /api/zk/organizations/[orgId]/members/invite
 * Invite a user to the organization
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
    const body = await request.json();
    const { email, role = 'member', encryptedOrgKey } = body;

    if (!email) {
      return errorResponse('Email is required');
    }

    if (!encryptedOrgKey) {
      return errorResponse('Encrypted organization key is required');
    }

    // Verify admin+ membership
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'confirmed',
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!orgUser) {
      return errorResponse('Organization not found or insufficient permissions', 404);
    }

    // Validate role (can't invite as owner)
    const validRoles = ['admin', 'member', 'readonly'];
    if (!validRoles.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
    }

    // Check member limit
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: { select: { members: { where: { status: 'confirmed' } } } },
      },
    });

    if (!org) {
      return errorResponse('Organization not found', 404);
    }

    if (org._count.members >= org.maxMembers) {
      return errorResponse(`Organization member limit reached (${org.maxMembers})`, 403);
    }

    // Find the user to invite
    const invitee = await prisma.zKUser.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!invitee) {
      return errorResponse('User not found. They must register first.', 404);
    }

    // Check if already a member
    const existingMembership = await prisma.organizationUser.findFirst({
      where: {
        userId: invitee.id,
        organizationId: orgId,
      },
    });

    if (existingMembership) {
      if (existingMembership.status === 'revoked') {
        // Re-invite a previously revoked member
        await prisma.organizationUser.update({
          where: { id: existingMembership.id },
          data: {
            status: OrganizationUserStatus.INVITED,
            role,
            encryptedOrgKey,
          },
        });
      } else {
        return errorResponse('User is already a member or has a pending invitation', 409);
      }
    } else {
      // Create new invitation
      await prisma.organizationUser.create({
        data: {
          userId: invitee.id,
          organizationId: orgId,
          role,
          status: OrganizationUserStatus.INVITED,
          encryptedOrgKey,
        },
      });
    }

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'user_invited',
      targetType: 'user',
      targetId: invitee.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { inviteeEmail: email, role },
    });

    const response = successResponse({ message: 'Invitation sent successfully' }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Invite member error:', error);
    return errorResponse('Failed to invite member', 500);
  }
}
