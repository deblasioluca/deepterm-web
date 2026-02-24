import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { normalizeIssueStatus } from '@/lib/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      title: true,
      description: true,
      area: true,
      status: true,
      reporterFeedback: true,
      reporterFeedbackAt: true,
      createdAt: true,
      updatedAt: true,
      user: { select: { id: true, email: true, name: true } },
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

  if (!issue) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({ issue });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const statusRaw = typeof body?.status === 'string' ? body.status : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  const status = statusRaw ? normalizeIssueStatus(statusRaw) : null;

  const existing = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { status: true },
  });

  if (!existing) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const nextStatus = status || existing.status;
  const statusChanged = nextStatus !== existing.status;

  if (!message && !statusChanged) {
    return NextResponse.json(
      { error: 'Provide a message and/or change status.' },
      { status: 400 }
    );
  }

  await prisma.issue.update({
    where: { id: params.id },
    data: {
      status: nextStatus,
      updatedAt: new Date(),
    },
  });

  await prisma.issueUpdate.create({
    data: {
      issueId: params.id,
      authorType: 'admin',
      authorEmail: session.email,
      message: message || (statusChanged ? `Status changed to ${nextStatus}.` : 'Update posted.'),
      status: statusChanged ? nextStatus : null,
    },
  });

  return NextResponse.json({ success: true, status: nextStatus });
}
