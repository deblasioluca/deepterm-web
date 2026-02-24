import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const message = typeof body?.message === 'string' ? body.message.trim() : '';

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message too long (max 5000 chars)' }, { status: 400 });
  }

  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!issue || issue.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  await prisma.issueUpdate.create({
    data: {
      issueId: params.id,
      authorType: 'user',
      authorEmail: session.user.email || undefined,
      message,
    },
  });

  await prisma.issue.update({
    where: { id: params.id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ success: true });
}
