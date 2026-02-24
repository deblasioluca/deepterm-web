import { prisma } from '@/lib/prisma';

export type AuditEventType =
  | 'user_registered'
  | 'login_success'
  | 'login_failed'
  | 'logout'
  | 'password_changed'
  | 'keys_rotated'
  | 'vault_created'
  | 'vault_updated'
  | 'vault_deleted'
  | 'vault_item_created'
  | 'vault_item_read'
  | 'vault_item_updated'
  | 'vault_item_deleted'
  | 'vault_item_restored'
  | 'org_created'
  | 'org_updated'
  | 'org_deleted'
  | 'user_invited'
  | 'user_confirmed'
  | 'user_removed'
  | 'user_role_changed'
  | 'device_registered'
  | 'device_removed'
  | 'sync_performed'
  | 'token_refreshed'
  | 'token_revoked'
  | 'bulk_operation';

export type AuditTargetType = 
  | 'user'
  | 'vault'
  | 'vault_item'
  | 'organization'
  | 'device'
  | 'token';

export interface AuditLogData {
  userId?: string;
  organizationId?: string;
  eventType: AuditEventType;
  targetType?: AuditTargetType;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.zKAuditLog.create({
      data: {
        userId: data.userId,
        organizationId: data.organizationId,
        eventType: data.eventType,
        targetType: data.targetType,
        targetId: data.targetId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        deviceInfo: data.deviceInfo ? JSON.stringify(data.deviceInfo) : null,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
  } catch (error) {
    // Log error but don't fail the main operation
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Get audit logs for a user
 */
export async function getUserAuditLogs(
  userId: string,
  options: {
    limit?: number;
    offset?: number;
    eventTypes?: AuditEventType[];
    startDate?: Date;
    endDate?: Date;
  } = {}
) {
  const { limit = 50, offset = 0, eventTypes, startDate, endDate } = options;

  const where: Record<string, unknown> = { userId };

  if (eventTypes && eventTypes.length > 0) {
    where.eventType = { in: eventTypes };
  }

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
    if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.zKAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.zKAuditLog.count({ where }),
  ]);

  return {
    data: logs.map(log => ({
      ...log,
      deviceInfo: log.deviceInfo ? JSON.parse(log.deviceInfo) : null,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    })),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}

/**
 * Get audit logs for an organization
 */
export async function getOrganizationAuditLogs(
  organizationId: string,
  options: {
    limit?: number;
    offset?: number;
    eventTypes?: AuditEventType[];
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}
) {
  const { limit = 50, offset = 0, eventTypes, startDate, endDate, userId } = options;

  const where: Record<string, unknown> = { organizationId };

  if (eventTypes && eventTypes.length > 0) {
    where.eventType = { in: eventTypes };
  }

  if (userId) {
    where.userId = userId;
  }

  if (startDate || endDate) {
    where.timestamp = {};
    if (startDate) (where.timestamp as Record<string, Date>).gte = startDate;
    if (endDate) (where.timestamp as Record<string, Date>).lte = endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.zKAuditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset,
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    }),
    prisma.zKAuditLog.count({ where }),
  ]);

  return {
    data: logs.map(log => ({
      ...log,
      deviceInfo: log.deviceInfo ? JSON.parse(log.deviceInfo) : null,
      metadata: log.metadata ? JSON.parse(log.metadata) : null,
    })),
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
  };
}

/**
 * Clean up old audit logs (keep 90 days by default)
 */
export async function cleanupAuditLogs(retentionDays: number = 90): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const result = await prisma.zKAuditLog.deleteMany({
    where: {
      timestamp: { lt: cutoff },
    },
  });

  return result.count;
}
