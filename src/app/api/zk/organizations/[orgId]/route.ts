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
 * GET /api/zk/organizations/[orgId]
 * Get organization details
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;

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

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        _count: {
          select: {
            members: { where: { status: 'confirmed' } },
            vaults: true,
          },
        },
      },
    });

    if (!org) {
      return errorResponse('Organization not found', 404);
    }

    const response = successResponse({
      id: org.id,
      name: org.name,
      billingEmail: org.billingEmail,
      plan: org.plan,
      memberCount: org._count.members,
      vaultCount: org._count.vaults,
      maxMembers: org.maxMembers,
      maxVaults: org.maxVaults,
      yourRole: orgUser.role,
      encryptedOrgKey: orgUser.encryptedOrgKey,
      createdAt: org.createdAt.toISOString(),
      updatedAt: org.updatedAt.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get organization error:', error);
    return errorResponse('Failed to get organization', 500);
  }
}

/**
 * PUT /api/zk/organizations/[orgId]
 * Update organization details
 */
export async function PUT(
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
    const { name, billingEmail } = body;

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

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        name: name || undefined,
        billingEmail: billingEmail !== undefined ? billingEmail : undefined,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: orgId,
      eventType: 'org_updated',
      targetType: 'organization',
      targetId: orgId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Organization updated successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update organization error:', error);
    return errorResponse('Failed to update organization', 500);
  }
}

/**
 * DELETE /api/zk/organizations/[orgId]
 * Delete an organization (owner only)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;

    // Verify owner
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'confirmed',
        role: 'owner',
      },
    });

    if (!orgUser) {
      return errorResponse('Organization not found or insufficient permissions', 404);
    }

    // Delete organization (cascades will handle members and vaults)
    await prisma.organization.delete({
      where: { id: orgId },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      eventType: 'org_deleted',
      targetType: 'organization',
      targetId: orgId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { organizationId: orgId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete organization error:', error);
    return errorResponse('Failed to delete organization', 500);
  }
}
