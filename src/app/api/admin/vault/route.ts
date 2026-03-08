import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tab = searchParams.get('tab') || 'users';

    if (tab === 'users') {
      const users = await prisma.zKUser.findMany({
        select: {
          id: true,
          email: true,
          emailVerified: true,
          kdfType: true,
          kdfIterations: true,
          createdAt: true,
          updatedAt: true,
          webUserId: true,
          appleProductId: true,
          appleExpiresDate: true,
          _count: {
            select: {
              zkVaults: true,
              zkVaultItems: true,
              devices: true,
              refreshTokens: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      const totalItems = await prisma.zKVaultItem.count();
      const deletedItems = await prisma.zKVaultItem.count({ where: { deletedAt: { not: null } } });

      return NextResponse.json({
        users,
        stats: {
          totalUsers: users.length,
          totalVaults: users.reduce((sum, u) => sum + u._count.zkVaults, 0),
          totalItems,
          deletedItems,
        },
      });
    }

    if (tab === 'audit') {
      const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
      const eventType = searchParams.get('eventType') || undefined;

      const where: Record<string, unknown> = {};
      if (eventType) where.eventType = eventType;

      const logs = await prisma.zKAuditLog.findMany({
        where,
        select: {
          id: true,
          eventType: true,
          targetType: true,
          targetId: true,
          ipAddress: true,
          deviceInfo: true,
          timestamp: true,
          user: { select: { email: true } },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      const eventTypes = await prisma.zKAuditLog.groupBy({
        by: ['eventType'],
        _count: true,
        orderBy: { _count: { eventType: 'desc' } },
      });

      return NextResponse.json({ logs, eventTypes });
    }

    return NextResponse.json({ error: 'Invalid tab' }, { status: 400 });
  } catch (error) {
    console.error('Admin vault API error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
