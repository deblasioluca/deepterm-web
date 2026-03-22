import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/invitations/pending
 * Lists pending organization invitations for the current user.
 * Returns orgs where the user has OrganizationUser status="invited".
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const pendingInvitations = await prisma.organizationUser.findMany({
      where: {
        userId: auth.userId,
        status: 'invited',
      },
      include: {
        organization: {
          select: { id: true, name: true },
        },
      },
    });

    const result = pendingInvitations.map((inv) => ({
      orgId: inv.organization.id,
      orgName: inv.organization.name,
      role: inv.role,
      encryptedOrgKey: inv.encryptedOrgKey || '',
      invitedAt: inv.createdAt.toISOString(),
    }));

    const response = successResponse(result);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('List pending invitations error:', error);
    return errorResponse('Failed to list pending invitations', 500);
  }
}
