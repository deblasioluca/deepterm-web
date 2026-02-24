import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FeedbackValue = 'up' | 'down' | null;

function normalizeFeedback(value: unknown): FeedbackValue {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'up') return 'up';
  if (v === 'down') return 'down';
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const feedback = normalizeFeedback(body?.feedback);

  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!issue || issue.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  await prisma.issue.update({
    where: { id: params.id },
    data: {
      reporterFeedback: feedback,
      reporterFeedbackAt: feedback ? new Date() : null,
      updatedAt: new Date(),
    } as any,
  });

  return NextResponse.json({ success: true, feedback });
}
