import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const entityType = searchParams.get('entityType') || '';
    const source = searchParams.get('source') || ''; // 'admin' | 'vault' | '' (both)
    const from = searchParams.get('from') || '';
    const to = searchParams.get('to') || '';
    const exportFormat = searchParams.get('export') || ''; // 'csv' | 'json'

    const skip = (page - 1) * limit;

    /* ---------- Admin AuditLog query ---------- */
    const adminWhere: Record<string, unknown> = {};
    if (search) {
      adminWhere.OR = [
        { action: { contains: search } },
        { entityId: { contains: search } },
      ];
    }
    if (entityType) adminWhere.entityType = entityType;
    if (from) adminWhere.createdAt = { ...(adminWhere.createdAt as object || {}), gte: new Date(from) };
    if (to) adminWhere.createdAt = { ...(adminWhere.createdAt as object || {}), lte: new Date(to + 'T23:59:59Z') };

    /* ---------- ZKAuditLog query ---------- */
    const zkWhere: Record<string, unknown> = {};
    if (search) {
      zkWhere.OR = [
        { eventType: { contains: search } },
        { targetId: { contains: search } },
      ];
    }
    if (entityType) zkWhere.targetType = entityType;
    if (from) zkWhere.timestamp = { ...(zkWhere.timestamp as object || {}), gte: new Date(from) };
    if (to) zkWhere.timestamp = { ...(zkWhere.timestamp as object || {}), lte: new Date(to + 'T23:59:59Z') };

    /* ---------- Fetch both sources ---------- */
    const fetchAdmin = source !== 'vault';
    const fetchVault = source !== 'admin';

    const [adminLogs, adminTotal, zkLogs, zkTotal] = await Promise.all([
      fetchAdmin
        ? prisma.auditLog.findMany({
            where: adminWhere,
            orderBy: { createdAt: 'desc' },
            take: exportFormat ? 10000 : undefined,
            include: { admin: { select: { name: true } } },
          })
        : Promise.resolve([]),
      fetchAdmin ? prisma.auditLog.count({ where: adminWhere }) : Promise.resolve(0),
      fetchVault
        ? prisma.zKAuditLog.findMany({
            where: zkWhere,
            orderBy: { timestamp: 'desc' },
            take: exportFormat ? 10000 : undefined,
            include: { user: { select: { email: true } } },
          })
        : Promise.resolve([]),
      fetchVault ? prisma.zKAuditLog.count({ where: zkWhere }) : Promise.resolve(0),
    ]);

    /* ---------- Normalize into unified shape ---------- */
    type UnifiedLog = {
      id: string;
      source: 'admin' | 'vault';
      actor: string;
      action: string;
      entityType: string;
      entityId: string;
      ipAddress: string | null;
      metadata: string | null;
      timestamp: Date;
    };

    const adminNormalized: UnifiedLog[] = adminLogs.map((log) => ({
      id: log.id,
      source: 'admin' as const,
      actor: log.admin.name,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      ipAddress: log.ipAddress,
      metadata: log.metadata,
      timestamp: log.createdAt,
    }));

    const zkNormalized: UnifiedLog[] = zkLogs.map((log) => ({
      id: log.id,
      source: 'vault' as const,
      actor: log.user?.email || 'unknown',
      action: log.eventType,
      entityType: log.targetType || 'vault',
      entityId: log.targetId || '',
      ipAddress: log.ipAddress,
      metadata: log.metadata,
      timestamp: log.timestamp,
    }));

    const merged = [...adminNormalized, ...zkNormalized]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const total = adminTotal + zkTotal;

    /* ---------- Export ---------- */
    if (exportFormat === 'csv') {
      const header = 'id,source,actor,action,entityType,entityId,ipAddress,timestamp\n';
      const rows = merged.map((l) =>
        [l.id, l.source, l.actor, l.action, l.entityType, l.entityId, l.ipAddress || '', l.timestamp.toISOString()].join(',')
      ).join('\n');
      return new NextResponse(header + rows, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename=audit-logs-${new Date().toISOString().slice(0, 10)}.csv`,
        },
      });
    }

    if (exportFormat === 'json') {
      return new NextResponse(JSON.stringify(merged, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename=audit-logs-${new Date().toISOString().slice(0, 10)}.json`,
        },
      });
    }

    /* ---------- Paginated response ---------- */
    const paginated = merged.slice(skip, skip + limit);

    return NextResponse.json({
      logs: paginated,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
