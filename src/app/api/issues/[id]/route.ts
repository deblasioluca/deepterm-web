import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const id = params.id;

  const issue = await prisma.issue.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      area: true,
      status: true,
      reporterFeedback: true,
      reporterFeedbackAt: true,
      createdAt: true,
      updatedAt: true,
      attachments: {
        select: {
          id: true,
          kind: true,
          originalFilename: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      updates: {
        select: {
          id: true,
          authorType: true,
          authorEmail: true,
          message: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!issue || issue.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({ issue: { ...issue, userId: undefined } });
}
