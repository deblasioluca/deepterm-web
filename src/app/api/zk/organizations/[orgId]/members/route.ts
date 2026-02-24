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
 * GET /api/zk/organizations/[orgId]/members
 * List organization members
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

    const members = await prisma.organizationUser.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            publicKey: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' },
        { createdAt: 'asc' },
      ],
    });

    const response = successResponse(
      members.map(m => ({
        id: m.id,
        userId: m.userId,
        email: m.user.email,
        publicKey: m.user.publicKey,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt.toISOString(),
        updatedAt: m.updatedAt.toISOString(),
      }))
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('List members error:', error);
    return errorResponse('Failed to list members', 500);
  }
}
