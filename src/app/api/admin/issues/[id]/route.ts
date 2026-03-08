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
      priority: true,
      assignedTo: true,
      firstResponseAt: true,
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
          visibility: true,
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
  const visibility = body?.visibility === 'internal' ? 'internal' : 'public';
  const status = statusRaw ? normalizeIssueStatus(statusRaw) : null;

  const existing = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { status: true, firstResponseAt: true },
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

  const isFirstResponse = !existing.firstResponseAt;

  await prisma.issue.update({
    where: { id: params.id },
    data: {
      status: nextStatus,
      updatedAt: new Date(),
      ...(isFirstResponse && visibility === 'public' ? { firstResponseAt: new Date() } : {}),
    },
  });

  await prisma.issueUpdate.create({
    data: {
      issueId: params.id,
      authorType: 'admin',
      authorEmail: session.email,
      message: message || (statusChanged ? `Status changed to ${nextStatus}.` : 'Update posted.'),
      status: statusChanged ? nextStatus : null,
      visibility,
    },
  });

  return NextResponse.json({ success: true, status: nextStatus });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const data: Record<string, string> = {};

  if (typeof body?.priority === 'string' && ['low', 'medium', 'high', 'urgent'].includes(body.priority)) {
    data.priority = body.priority;
  }
  if (typeof body?.assignedTo === 'string') {
    data.assignedTo = body.assignedTo || '';
  }
  if (typeof body?.area === 'string') {
    data.area = body.area;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  // Convert empty assignedTo to null
  const updateData = { ...data, assignedTo: data.assignedTo === '' ? null : data.assignedTo };

  const issue = await prisma.issue.update({
    where: { id: params.id },
    data: updateData,
    select: { id: true, priority: true, assignedTo: true, area: true },
  });

  return NextResponse.json({ issue });
}
