import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issues = await prisma.issue.findMany({
    select: {
      id: true,
      title: true,
      area: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { email: true, name: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ issues });
}
