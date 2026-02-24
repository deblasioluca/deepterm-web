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
 * GET /api/zk/vaults/[id]
 * Get a specific vault with its items
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;

    // Get user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Get the vault
    const vault = await prisma.zKVault.findFirst({
      where: {
        id,
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
      include: {
        organization: {
          select: { name: true },
        },
        items: {
          where: { deletedAt: null },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!vault) {
      return errorResponse('Vault not found or access denied', 404);
    }

    const response = successResponse({
      id: vault.id,
      name: vault.name,
      userId: vault.userId,
      organizationId: vault.organizationId,
      organizationName: vault.organization?.name || null,
      isPersonal: vault.userId === auth.userId && !vault.organizationId,
      items: vault.items.map(item => ({
        id: item.id,
        encryptedData: item.encryptedData,
        revisionDate: item.revisionDate.toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      createdAt: vault.createdAt.toISOString(),
      updatedAt: vault.updatedAt.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get vault error:', error);
    return errorResponse('Failed to get vault', 500);
  }
}

/**
 * PUT /api/zk/vaults/[id]
 * Update a vault
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name) {
      return errorResponse('Vault name is required');
    }

    // Get user's org memberships (need admin+ for org vaults)
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true, role: true },
    });
    const adminOrgIds = orgUsers
      .filter(ou => ['owner', 'admin'].includes(ou.role))
      .map(ou => ou.organizationId);

    // Get the vault
    const vault = await prisma.zKVault.findFirst({
      where: {
        id,
        OR: [
          { userId: auth.userId },
          { organizationId: { in: adminOrgIds } },
        ],
      },
    });

    if (!vault) {
      return errorResponse('Vault not found or insufficient permissions', 404);
    }

    // Update the vault
    await prisma.zKVault.update({
      where: { id },
      data: { name },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: vault.organizationId || undefined,
      eventType: 'vault_updated',
      targetType: 'vault',
      targetId: id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({ message: 'Vault updated successfully' });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update vault error:', error);
    return errorResponse('Failed to update vault', 500);
  }
}

/**
 * DELETE /api/zk/vaults/[id]
 * Delete a vault and all its items
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { id } = await params;

    // Get user's org memberships (need admin+ for org vaults)
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true, role: true },
    });
    const adminOrgIds = orgUsers
      .filter(ou => ['owner', 'admin'].includes(ou.role))
      .map(ou => ou.organizationId);

    // Get the vault
    const vault = await prisma.zKVault.findFirst({
      where: {
        id,
        OR: [
          { userId: auth.userId },
          { organizationId: { in: adminOrgIds } },
        ],
      },
    });

    if (!vault) {
      return errorResponse('Vault not found or insufficient permissions', 404);
    }

    // Delete the vault (cascade will delete items)
    await prisma.zKVault.delete({
      where: { id },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: vault.organizationId || undefined,
      eventType: 'vault_deleted',
      targetType: 'vault',
      targetId: id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete vault error:', error);
    return errorResponse('Failed to delete vault', 500);
  }
}
