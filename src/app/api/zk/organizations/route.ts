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
  OrganizationRole,
  OrganizationUserStatus,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/organizations
 * List all organizations the user belongs to.
 * Accepts both Bearer token (macOS app) and NextAuth session (web dashboard).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthFromRequestOrSession(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    // Session-only users (no ZKUser) can only be found by invitedEmail.
    // Full JWTPayload users are found by ZKUser.id, with email as fallback.
    const orgUsers = await prisma.organizationUser.findMany({
      where: isSessionOnlyAuth(auth)
        ? { invitedEmail: auth.email }
        : {
            OR: [
              { userId: auth.userId },
              ...(auth.email ? [{ invitedEmail: auth.email }] : []),
            ],
          },
      include: {
        organization: {
          include: {
            _count: {
              select: {
                members: { where: { status: 'confirmed' } },
                vaults: true,
              },
            },
          },
        },
      },
    });

    const response = successResponse(
      orgUsers.map(ou => ({
        id: ou.organization.id,
        name: ou.organization.name,
        role: ou.role,
        status: ou.status,
        encryptedOrgKey: ou.encryptedOrgKey,
        plan: ou.organization.plan,
        memberCount: ou.organization._count.members,
        vaultCount: ou.organization._count.vaults,
        maxMembers: ou.organization.maxMembers,
        maxVaults: ou.organization.maxVaults,
        createdAt: ou.organization.createdAt.toISOString(),
      }))
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('List organizations error:', error);
    return errorResponse('Failed to list organizations', 500);
  }
}

/**
 * POST /api/zk/organizations
 * Create a new organization
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { name, billingEmail, encryptedOrgKey } = body;

    if (!name) {
      return errorResponse('Organization name is required');
    }

    if (!encryptedOrgKey) {
      return errorResponse('Encrypted organization key is required');
    }

    // Create the organization with the user as owner
    const org = await prisma.organization.create({
      data: {
        name,
        billingEmail: billingEmail || null,
        members: {
          create: {
            userId: auth.userId,
            role: OrganizationRole.OWNER,
            status: OrganizationUserStatus.CONFIRMED,
            confirmedAt: new Date(),
            encryptedOrgKey,
          },
        },
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: org.id,
      eventType: 'org_created',
      targetType: 'organization',
      targetId: org.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ id: org.id }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create organization error:', error);
    return errorResponse('Failed to create organization', 500);
  }
}
