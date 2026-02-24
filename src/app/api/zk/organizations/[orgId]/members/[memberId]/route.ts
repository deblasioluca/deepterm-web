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
 * GET /api/zk/organizations/[orgId]/members/[memberId]
 * Get a specific member
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId, memberId } = await params;

    // Verify membership
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'confirmed',
      },
    });

    if (!orgUser) {
      return errorResponse('Organization not found or access denied', 404);
    }

    const member = await prisma.organizationUser.findFirst({
      where: {
        id: memberId,
        organizationId: orgId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            publicKey: true,
          },
        },
      },
    });

    if (!member) {
      return errorResponse('Member not found', 404);
    }

    const response = successResponse({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      publicKey: member.user.publicKey,
      role: member.role,
      status: member.status,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get member error:', error);
    return errorResponse('Failed to get member', 500);
  }
}

/**
 * PUT /api/zk/organizations/[orgId]/members/[memberId]
 * Update a member's role
 */
export async function PUT(
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
    const { role } = body;

    if (!role) {
      return errorResponse('Role is required');
    }

    // Validate role
    const validRoles = ['admin', 'member', 'readonly'];
    if (!validRoles.includes(role)) {
      return errorResponse(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
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

    // Get the member to update
    const member = await prisma.organizationUser.findFirst({
      where: {
        id: memberId,
        organizationId: orgId,
      },
    });

    if (!member) {
      return errorResponse('Member not found', 404);
    }

    // Can't change owner's role
    if (member.role === 'owner') {
      return errorResponse('Cannot change the owner\'s role', 403);
    }

    // Admins can't promote to admin (only owner can)
    if (role === 'admin' && orgUser.role !== 'owner') {
      return errorResponse('Only the owner can promote members to admin', 403);
    }

    await prisma.organizationUser.update({
      where: { id: memberId },
      data: { role },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'user_role_changed',
      targetType: 'user',
      targetId: member.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { previousRole: member.role, newRole: role },
    });

    const response = successResponse({ message: 'Member role updated successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update member error:', error);
    return errorResponse('Failed to update member', 500);
  }
}

/**
 * DELETE /api/zk/organizations/[orgId]/members/[memberId]
 * Remove a member from the organization
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId, memberId } = await params;

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

    // Get the member to remove
    const member = await prisma.organizationUser.findFirst({
      where: {
        id: memberId,
        organizationId: orgId,
      },
    });

    if (!member) {
      return errorResponse('Member not found', 404);
    }

    // Can't remove the owner
    if (member.role === 'owner') {
      return errorResponse('Cannot remove the organization owner', 403);
    }

    // Admins can only remove members/readonly, not other admins
    if (member.role === 'admin' && orgUser.role !== 'owner') {
      return errorResponse('Only the owner can remove admins', 403);
    }

    // Soft-delete by setting status to revoked
    await prisma.organizationUser.update({
      where: { id: memberId },
      data: {
        status: OrganizationUserStatus.REVOKED,
        encryptedOrgKey: null, // Clear the key
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'user_removed',
      targetType: 'user',
      targetId: member.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Remove member error:', error);
    return errorResponse('Failed to remove member', 500);
  }
}
