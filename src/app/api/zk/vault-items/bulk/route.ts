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

interface BulkCreateItem {
  id?: string; // Optional client-generated stable ID
  vaultId: string;
  encryptedData: string;
  clientId?: string; // Client-side temporary ID for tracking
}

interface BulkUpdateItem {
  id: string;
  vaultId?: string;
  encryptedData?: string;
  revisionDate?: string; // For optimistic concurrency
}

interface BulkDeleteItem {
  id: string;
  permanent?: boolean;
}

/**
 * POST /api/zk/vault-items/bulk
 * Bulk create, update, and delete vault items
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const {
      create = [] as BulkCreateItem[],
      update = [] as BulkUpdateItem[],
      delete: deleteItems = [] as BulkDeleteItem[],
    } = body;

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
      select: { id: true, organizationId: true },
    });
    const vaultIds = vaults.map(v => v.id);
    const vaultOrgMap = new Map(vaults.map(v => [v.id, v.organizationId]));

    const results = {
      created: [] as { id: string; clientId?: string; revisionDate: string }[],
      updated: [] as { id: string; revisionDate: string }[],
      deleted: [] as string[],
      conflicts: [] as { id: string; currentRevisionDate: string; operation: string }[],
      errors: [] as { id?: string; clientId?: string; error: string; operation: string }[],
    };

    // Enforce vault item limits for creates
    if (create.length > 0) {
      const limitCheck = await checkVaultItemLimit(auth.userId);
      if (!limitCheck.allowed) {
        // Reject all creates — user is at or over limit
        for (const item of create) {
          results.errors.push({
            clientId: item.clientId,
            error: `Vault item limit reached (${limitCheck.maxVaultItems}). Upgrade your plan.`,
            operation: 'create',
          });
        }
        // Clear create array so the loop below is skipped
        create.length = 0;
      } else if (limitCheck.remaining !== -1 && create.length > limitCheck.remaining) {
        // Partially reject — allow up to remaining slots
        const rejected = create.splice(limitCheck.remaining);
        for (const item of rejected) {
          results.errors.push({
            clientId: item.clientId,
            error: `Vault item limit (${limitCheck.maxVaultItems}) would be exceeded. ${limitCheck.remaining} slots remaining.`,
            operation: 'create',
          });
        }
      }
    }

    // Process creates
    for (const item of create) {
      try {
        if (!vaultIds.includes(item.vaultId)) {
          results.errors.push({
            clientId: item.clientId,
            error: 'Vault not found or access denied',
            operation: 'create',
          });
          continue;
        }

        if (item.id) {
          const existingById = await prisma.zKVaultItem.findUnique({
            where: { id: item.id },
            select: { id: true, vaultId: true, revisionDate: true },
          });

          if (existingById) {
            if (!vaultIds.includes(existingById.vaultId)) {
              results.errors.push({
                clientId: item.clientId,
                id: item.id,
                error: 'Item exists but access denied',
                operation: 'create',
              });
              continue;
            }

            const newRevisionDate = new Date();
            await prisma.zKVaultItem.update({
              where: { id: existingById.id },
              data: {
                vaultId: item.vaultId,
                encryptedData: item.encryptedData,
                deletedAt: null,
                revisionDate: newRevisionDate,
              },
            });

            results.updated.push({
              id: existingById.id,
              revisionDate: newRevisionDate.toISOString(),
            });
            continue;
          }
        }

        // Check for duplicate (same vault + encrypted data)
        const existingItem = await prisma.zKVaultItem.findFirst({
          where: {
            vaultId: item.vaultId,
            encryptedData: item.encryptedData,
            deletedAt: null,
          },
        });

        if (existingItem) {
          // Return existing item instead of creating duplicate
          results.created.push({
            id: existingItem.id,
            clientId: item.clientId,
            revisionDate: existingItem.revisionDate.toISOString(),
          });
          continue;
        }

        const revisionDate = new Date();
        const created = await prisma.zKVaultItem.create({
          data: {
            ...(item.id ? { id: item.id } : {}),
            vaultId: item.vaultId,
            userId: auth.userId,
            encryptedData: item.encryptedData,
            revisionDate,
          },
        });

        results.created.push({
          id: created.id,
          clientId: item.clientId,
          revisionDate: revisionDate.toISOString(),
        });

        // Audit log
        await createAuditLog({
          userId: auth.userId,
          organizationId: vaultOrgMap.get(item.vaultId) || undefined,
          eventType: 'vault_item_created',
          targetType: 'vault_item',
          targetId: created.id,
          ipAddress: getClientIP(request),
          userAgent: request.headers.get('user-agent') || undefined,
          metadata: { bulk: true },
        });
      } catch (error) {
        results.errors.push({
          clientId: item.clientId,
          error: 'Failed to create item',
          operation: 'create',
        });
      }
    }

    // Process updates
    for (const item of update) {
      try {
        const existing = await prisma.zKVaultItem.findFirst({
          where: {
            id: item.id,
            vaultId: { in: vaultIds },
          },
        });

        if (!existing) {
          results.errors.push({
            id: item.id,
            error: 'Item not found or access denied',
            operation: 'update',
          });
          continue;
        }

        // Check optimistic concurrency
        if (item.revisionDate) {
          const expectedRevision = new Date(item.revisionDate);
          if (existing.revisionDate.getTime() !== expectedRevision.getTime()) {
            results.conflicts.push({
              id: item.id,
              currentRevisionDate: existing.revisionDate.toISOString(),
              operation: 'update',
            });
            continue;
          }
        }

        // Verify target vault access if moving
        if (item.vaultId && item.vaultId !== existing.vaultId) {
          if (!vaultIds.includes(item.vaultId)) {
            results.errors.push({
              id: item.id,
              error: 'Target vault not found or access denied',
              operation: 'update',
            });
            continue;
          }
        }

        const newRevisionDate = new Date();
        await prisma.zKVaultItem.update({
          where: { id: item.id },
          data: {
            vaultId: item.vaultId || existing.vaultId,
            encryptedData: item.encryptedData || existing.encryptedData,
            revisionDate: newRevisionDate,
          },
        });

        results.updated.push({
          id: item.id,
          revisionDate: newRevisionDate.toISOString(),
        });

        // Audit log
        await createAuditLog({
          userId: auth.userId,
          organizationId: vaultOrgMap.get(existing.vaultId) || undefined,
          eventType: 'vault_item_updated',
          targetType: 'vault_item',
          targetId: item.id,
          ipAddress: getClientIP(request),
          userAgent: request.headers.get('user-agent') || undefined,
          metadata: { bulk: true },
        });
      } catch (error) {
        results.errors.push({
          id: item.id,
          error: 'Failed to update item',
          operation: 'update',
        });
      }
    }

    // Process deletes
    for (const item of deleteItems) {
      try {
        const existing = await prisma.zKVaultItem.findFirst({
          where: {
            id: item.id,
            vaultId: { in: vaultIds },
          },
        });

        if (!existing) {
          results.errors.push({
            id: item.id,
            error: 'Item not found or access denied',
            operation: 'delete',
          });
          continue;
        }

        if (item.permanent) {
          await prisma.zKVaultItem.delete({
            where: { id: item.id },
          });
        } else {
          await prisma.zKVaultItem.update({
            where: { id: item.id },
            data: {
              deletedAt: new Date(),
              revisionDate: new Date(),
            },
          });
        }

        results.deleted.push(item.id);

        // Audit log
        await createAuditLog({
          userId: auth.userId,
          organizationId: vaultOrgMap.get(existing.vaultId) || undefined,
          eventType: 'vault_item_deleted',
          targetType: 'vault_item',
          targetId: item.id,
          ipAddress: getClientIP(request),
          userAgent: request.headers.get('user-agent') || undefined,
          metadata: { bulk: true, permanent: item.permanent },
        });
      } catch (error) {
        results.errors.push({
          id: item.id,
          error: 'Failed to delete item',
          operation: 'delete',
        });
      }
    }

    // Audit log for bulk operation
    await createAuditLog({
      userId: auth.userId,
      eventType: 'bulk_operation',
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      metadata: {
        created: results.created.length,
        updated: results.updated.length,
        deleted: results.deleted.length,
        conflicts: results.conflicts.length,
        errors: results.errors.length,
      },
    });

    const response = successResponse(results);
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Bulk operation error:', error);
    return errorResponse('Bulk operation failed', 500);
  }
}
