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
import { checkVaultItemLimit } from '@/lib/zk/vault-limits';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/vault-items
 * List all vault items the user has access to
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const vaultId = searchParams.get('vaultId');
    const includeDeleted = searchParams.get('includeDeleted') === 'true';

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

    // Build query
    const where: Record<string, unknown> = {
      vaultId: vaultId ? vaultId : { in: vaultIds },
    };

    // Verify vault access if specific vault requested
    if (vaultId && !vaultIds.includes(vaultId)) {
      return errorResponse('Vault not found or access denied', 404);
    }

    if (!includeDeleted) {
      where.deletedAt = null;
    }

    const items = await prisma.zKVaultItem.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });

    const response = successResponse(
      items.map(item => ({
        id: item.id,
        vaultId: item.vaultId,
        encryptedData: item.encryptedData,
        revisionDate: item.revisionDate.toISOString(),
        deletedAt: item.deletedAt?.toISOString() || null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      }))
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('List vault items error:', error);
    return errorResponse('Failed to list vault items', 500);
  }
}

/**
 * POST /api/zk/vault-items
 * Create a new vault item
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { id, vaultId, encryptedData } = body;

    // Validate required fields
    if (!vaultId || !encryptedData) {
      return errorResponse('vaultId and encryptedData are required');
    }

    // Get user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: auth.userId, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Verify vault access
    const vault = await prisma.zKVault.findFirst({
      where: {
        id: vaultId,
        OR: [
          { userId: auth.userId },
          { organizationId: { in: orgIds } },
        ],
      },
    });

    if (!vault) {
      return errorResponse('Vault not found or access denied', 404);
    }

    // Check for duplicate (same vault + same encrypted data)
    const existing = await prisma.zKVaultItem.findFirst({
      where: {
        vaultId,
        encryptedData,
        deletedAt: null,
      },
    });

    if (existing) {
      // Return existing item instead of creating duplicate
      const response = successResponse(
        {
          id: existing.id,
          revisionDate: existing.revisionDate.toISOString(),
        },
        200
      );
      return addCorsHeaders(response);
    }

    if (id) {
      const existingById = await prisma.zKVaultItem.findUnique({
        where: { id },
        select: { id: true, vaultId: true, revisionDate: true },
      });

      if (existingById) {
        if (existingById.vaultId !== vaultId) {
          return errorResponse('Item exists in a different vault or access denied', 409);
        }

        const newRevisionDate = new Date();
        await prisma.zKVaultItem.update({
          where: { id: existingById.id },
          data: {
            encryptedData,
            deletedAt: null,
            revisionDate: newRevisionDate,
          },
        });

        const response = successResponse(
          {
            id: existingById.id,
            revisionDate: newRevisionDate.toISOString(),
          },
          200
        );
        return addCorsHeaders(response);
      }
    }

    // Check vault item limit before creating
    const limitCheck = await checkVaultItemLimit(auth.userId);
    if (!limitCheck.allowed) {
      return errorResponse(
        `Vault item limit reached (${limitCheck.maxVaultItems} items on ${limitCheck.plan} plan). Upgrade for more.`,
        403
      );
    }

    // Create the item
    const revisionDate = new Date();
    const item = await prisma.zKVaultItem.create({
      data: {
        ...(id ? { id } : {}),
        vaultId,
        userId: auth.userId,
        encryptedData,
        revisionDate,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      organizationId: vault.organizationId || undefined,
      eventType: 'vault_item_created',
      targetType: 'vault_item',
      targetId: item.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: { vaultId },
    });

    const response = successResponse(
      {
        id: item.id,
        revisionDate: item.revisionDate.toISOString(),
      },
      201
    );

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Create vault item error:', error);
    return errorResponse('Failed to create vault item', 500);
  }
}
