/**
 * GET  /api/admin/security-alerts — list alerts (paginated, filterable)
 * PATCH /api/admin/security-alerts — bulk-resolve alerts
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50')));
    const eventType = searchParams.get('eventType') || '';
    const severity = searchParams.get('severity') || '';
    const resolved = searchParams.get('resolved'); // 'true' | 'false' | null (all)
    const sourceIp = searchParams.get('sourceIp') || '';

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (eventType) where.eventType = eventType;
    if (severity) where.severity = severity;
    if (resolved === 'true') where.resolved = true;
    else if (resolved === 'false') where.resolved = false;
    if (sourceIp) where.sourceIp = { contains: sourceIp };

    const [alerts, total] = await Promise.all([
      prisma.securityAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.securityAlert.count({ where }),
    ]);

    return NextResponse.json({
      alerts: alerts.map(a => ({
        ...a,
        details: a.details ? JSON.parse(a.details) : null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch security alerts:', error);
    return NextResponse.json({ error: 'Failed to fetch security alerts' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as { ids?: string[]; resolveAll?: boolean };

    if (body.resolveAll) {
      const result = await prisma.securityAlert.updateMany({
        where: { resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });
      return NextResponse.json({ resolved: result.count });
    }

    if (body.ids && Array.isArray(body.ids) && body.ids.length > 0) {
      const result = await prisma.securityAlert.updateMany({
        where: { id: { in: body.ids }, resolved: false },
        data: { resolved: true, resolvedAt: new Date() },
      });
      return NextResponse.json({ resolved: result.count });
    }

    return NextResponse.json({ error: 'Provide ids[] or resolveAll' }, { status: 400 });
  } catch (error) {
    console.error('Failed to resolve security alerts:', error);
    return NextResponse.json({ error: 'Failed to resolve alerts' }, { status: 500 });
  }
}
