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
 * GET /api/zk/vaults
 * List all vaults the user has access to
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    // Get user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Get vaults with item counts
    const vaults = await prisma.zKVault.findMany({
      where: {
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
      include: {
        _count: {
          select: {
            items: {
              where: { deletedAt: null },
            },
          },
        },
        organization: {
          select: { name: true },
        },
      },
    });

    const response = successResponse(
      vaults.map(vault => ({
        id: vault.id,
        name: vault.name,
        userId: vault.userId,
        organizationId: vault.organizationId,
        organizationName: vault.organization?.name || null,
        isPersonal: vault.userId === auth.userId && !vault.organizationId,
        itemCount: vault._count.items,
        createdAt: vault.createdAt.toISOString(),
        updatedAt: vault.updatedAt.toISOString(),
      }))
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('List vaults error:', error);
    return errorResponse('Failed to list vaults', 500);
  }
}

/**
 * POST /api/zk/vaults
 * Create a new vault
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { name, organizationId } = body;

    if (!name) {
      return errorResponse('Vault name is required');
    }

    // If creating an org vault, verify membership
    if (organizationId) {
      const orgUser = await prisma.organizationUser.findFirst({
        where: {
          userId: auth.userId,
          organizationId,
          status: 'confirmed',
          role: { in: ['owner', 'admin'] },
        },
      });

      if (!orgUser) {
        return errorResponse('Organization not found or insufficient permissions', 403);
      }

      // Check org vault limit
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        include: {
          _count: { select: { vaults: true } },
        },
      });

      if (org && org._count.vaults >= org.maxVaults) {
        return errorResponse(`Organization vault limit reached (${org.maxVaults})`, 403);
      }
    }

    // Create the vault
    const vault = await prisma.zKVault.create({
      data: {
        name,
        userId: organizationId ? null : auth.userId,
        organizationId: organizationId || null,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: organizationId || undefined,
      eventType: 'vault_created',
      targetType: 'vault',
      targetId: vault.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ id: vault.id }, 201);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create vault error:', error);
    return errorResponse('Failed to create vault', 500);
  }
}
