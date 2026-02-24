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
 * GET /api/zk/vault-items/[id]
 * Get a specific vault item
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

    // Get accessible vaults
    const vaults = await prisma.zKVault.findMany({
      where: {
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
      select: { id: true },
    });
    const vaultIds = vaults.map(v => v.id);

    // Get the item
    const item = await prisma.zKVaultItem.findFirst({
      where: {
        id,
        vaultId: { in: vaultIds },
      },
      include: {
        vault: {
          select: { organizationId: true },
        },
      },
    });

    if (!item) {
      return errorResponse('Vault item not found or access denied', 404);
    }

    // Audit log for read access
    await createAuditLog({
      userId: auth.userId,
      organizationId: item.vault.organizationId || undefined,
      eventType: 'vault_item_read',
      targetType: 'vault_item',
      targetId: item.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    const response = successResponse({
      id: item.id,
      vaultId: item.vaultId,
      encryptedData: item.encryptedData,
      revisionDate: item.revisionDate.toISOString(),
      deletedAt: item.deletedAt?.toISOString() || null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get vault item error:', error);
    return errorResponse('Failed to get vault item', 500);
  }
}

/**
 * PUT /api/zk/vault-items/[id]
 * Update a vault item with optimistic concurrency
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
    const { vaultId, encryptedData } = body;

    // Get If-Match header for optimistic concurrency
    const ifMatch = request.headers.get('if-match');

    // Get user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Get accessible vaults
    const vaults = await prisma.zKVault.findMany({
      where: {
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
      select: { id: true },
    });
    const vaultIds = vaults.map(v => v.id);

    // Get existing item
    const existingItem = await prisma.zKVaultItem.findFirst({
      where: {
        id,
        vaultId: { in: vaultIds },
      },
      include: {
        vault: {
          select: { organizationId: true },
        },
      },
    });

    if (!existingItem) {
      return errorResponse('Vault item not found or access denied', 404);
    }

    // Check optimistic concurrency
    if (ifMatch) {
      const expectedRevision = new Date(ifMatch);
      if (existingItem.revisionDate.getTime() !== expectedRevision.getTime()) {
        return NextResponse.json(
          {
            error: 'Conflict',
            message: 'The item has been modified. Please sync and retry.',
            currentRevisionDate: existingItem.revisionDate.toISOString(),
          },
          { status: 409 }
        );
      }
    }

    // If moving to a different vault, verify access
    if (vaultId && vaultId !== existingItem.vaultId) {
      if (!vaultIds.includes(vaultId)) {
        return errorResponse('Target vault not found or access denied', 404);
      }
    }

    const newRevisionDate = new Date();

    // Update the item
    const updatedItem = await prisma.zKVaultItem.update({
      where: { id },
      data: {
        vaultId: vaultId || existingItem.vaultId,
        encryptedData: encryptedData || existingItem.encryptedData,
        revisionDate: newRevisionDate,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: existingItem.vault.organizationId || undefined,
      eventType: 'vault_item_updated',
      targetType: 'vault_item',
      targetId: id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        vaultChanged: vaultId && vaultId !== existingItem.vaultId,
      },
    });

    const response = successResponse({
      id: updatedItem.id,
      revisionDate: updatedItem.revisionDate.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Update vault item error:', error);
    return errorResponse('Failed to update vault item', 500);
  }
}

/**
 * DELETE /api/zk/vault-items/[id]
 * Soft-delete a vault item
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
    const { searchParams } = new URL(request.url);
    const permanent = searchParams.get('permanent') === 'true';

    // Get user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Get accessible vaults
    const vaults = await prisma.zKVault.findMany({
      where: {
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
      select: { id: true },
    });
    const vaultIds = vaults.map(v => v.id);

    // Get existing item
    const existingItem = await prisma.zKVaultItem.findFirst({
      where: {
        id,
        vaultId: { in: vaultIds },
      },
      include: {
        vault: {
          select: { organizationId: true },
        },
      },
    });

    if (!existingItem) {
      return errorResponse('Vault item not found or access denied', 404);
    }

    if (permanent) {
      // Permanent delete
      await prisma.zKVaultItem.delete({
        where: { id },
      });
    } else {
      // Soft delete
      await prisma.zKVaultItem.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          revisionDate: new Date(),
        },
      });
    }

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: existingItem.vault.organizationId || undefined,
      eventType: 'vault_item_deleted',
      targetType: 'vault_item',
      targetId: id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { permanent },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('Delete vault item error:', error);
    return errorResponse('Failed to delete vault item', 500);
  }
}
