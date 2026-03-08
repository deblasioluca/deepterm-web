import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const area = searchParams.get('area');
  const assignedTo = searchParams.get('assignedTo');
  const search = searchParams.get('search');
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25')));

  const where: Prisma.IssueWhereInput = {};
  if (status) where.status = status;
  if (priority) where.priority = priority;
  if (area) where.area = area;
  if (assignedTo === 'unassigned') {
    where.assignedTo = null;
  } else if (assignedTo) {
    where.assignedTo = assignedTo;
  }
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { user: { email: { contains: search } } },
      { user: { name: { contains: search } } },
    ];
  }

  const [issues, total] = await Promise.all([
    prisma.issue.findMany({
      where,
      select: {
        id: true,
        title: true,
        area: true,
        status: true,
        priority: true,
        assignedTo: true,
        firstResponseAt: true,
        createdAt: true,
        updatedAt: true,
        user: { select: { email: true, name: true } },
        _count: { select: { updates: true, attachments: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.issue.count({ where }),
  ]);

  return NextResponse.json({
    issues,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
