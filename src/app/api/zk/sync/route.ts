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
 * GET /api/zk/sync
 * Full or delta sync of user's vault data
 * Query params:
 *   - since: ISO8601 timestamp for delta sync (optional)
 *   - excludeDeleted: boolean to exclude soft-deleted items (default: false)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get('since');
    const excludeDeleted = searchParams.get('excludeDeleted') === 'true';
    
    const sinceDate = sinceParam ? new Date(sinceParam) : null;
    const serverTimestamp = new Date();

    // Get user profile
    const user = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        email: true,
        publicKey: true,
        encryptedPrivateKey: true,
        protectedSymmetricKey: true,
        kdfType: true,
        kdfIterations: true,
        kdfMemory: true,
        kdfParallelism: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Get user's organization memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: {
        userId: auth.userId,
        status: 'confirmed',
      },
      include: {
        organization: true,
      },
    });

    const organizations = orgUsers.map(ou => ({
      id: ou.organization.id,
      name: ou.organization.name,
      role: ou.role,
      encryptedOrgKey: ou.encryptedOrgKey,
      plan: ou.organization.plan,
      maxMembers: ou.organization.maxMembers,
      maxVaults: ou.organization.maxVaults,
    }));

    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Build vault query - user's personal vaults + org vaults they have access to
    // Always include all vaults (they're lightweight) - only items are delta-synced
    const vaultWhere: Record<string, unknown> = {
      OR: [
        { userId: auth.userId },
        { organizationId: { in: orgIds } },
      ],
    };

    let vaults = await prisma.zKVault.findMany({
      where: vaultWhere,
      select: {
        id: true,
        name: true,
        userId: true,
        organizationId: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Ensure default vault exists
    const hasDefaultVault = vaults.some(v => v.isDefault);
    if (!hasDefaultVault) {
      const newDefaultVault = await prisma.zKVault.create({
        data: {
          userId: auth.userId,
          name: '', // Empty - encrypted name will be set by app on first sync
          isDefault: true,
        },
        select: {
          id: true,
          name: true,
          userId: true,
          organizationId: true,
          isDefault: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      vaults = [...vaults, newDefaultVault];
    }

    // Get vault IDs for item query
    const vaultIds = vaults.map(v => v.id);

    // Also get vaults that weren't updated but may have updated items
    let allAccessibleVaultIds = vaultIds;
    if (sinceDate) {
      const allVaults = await prisma.zKVault.findMany({
        where: {
          OR: [
            { userId: auth.userId },
            { organizationId: { in: orgIds } },
          ],
        },
        select: { id: true },
      });
      allAccessibleVaultIds = allVaults.map(v => v.id);
    }

    // Build vault items query
    const itemWhere: Record<string, unknown> = {
      vaultId: { in: allAccessibleVaultIds },
    };

    if (sinceDate) {
      itemWhere.OR = [
        { updatedAt: { gte: sinceDate } },
        { revisionDate: { gte: sinceDate } },
      ];
    }

    if (excludeDeleted) {
      itemWhere.deletedAt = null;
    }

    const items = await prisma.zKVaultItem.findMany({
      where: itemWhere,
      select: {
        id: true,
        vaultId: true,
        encryptedData: true,
        revisionDate: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { revisionDate: 'desc' },
    });

    // Get user's devices
    const devices = await prisma.device.findMany({
      where: { userId: auth.userId },
      select: {
        id: true,
        name: true,
        deviceType: true,
        lastActive: true,
        createdAt: true,
      },
    });

    // Audit log
    await createAuditLog({
      userId: auth.userId,
      eventType: 'sync_performed',
      targetType: 'user',
      targetId: auth.userId,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        deltaSync: !!sinceDate,
        vaultCount: vaults.length,
        itemCount: items.length,
      },
    });

    const response = successResponse({
      profile: user,
      organizations,
      defaultVaultId: vaults.find(v => v.isDefault)?.id || null,
      vaults: vaults.map(v => ({
        id: v.id,
        name: v.name,
        userId: v.userId,
        organizationId: v.organizationId,
        isDefault: v.isDefault,
        isPersonal: v.userId === auth.userId && !v.organizationId,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString(),
      })),
      items: items.map(item => ({
        id: item.id,
        vaultId: item.vaultId,
        encryptedData: item.encryptedData,
        revisionDate: item.revisionDate.toISOString(),
        deletedAt: item.deletedAt?.toISOString() || null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      devices,
      serverTimestamp: serverTimestamp.toISOString(),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Sync error:', error);
    return errorResponse('Sync failed', 500);
  }
}
