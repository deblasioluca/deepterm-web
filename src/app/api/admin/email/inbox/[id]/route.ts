/**
 * GET    /api/admin/email/inbox/[id] — get single email message with drafts
 * PATCH  /api/admin/email/inbox/[id] — update status
 * DELETE /api/admin/email/inbox/[id] — permanently delete
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const message = await prisma.emailMessage.findUnique({
      where: { id: params.id },
      include: {
        drafts: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!message) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Email message not found' },
        { status: 404 },
      );
    }

    // Auto-mark as read when viewed
    if (message.status === 'unread') {
      const updated = await prisma.emailMessage.update({
        where: { id: params.id },
        data: { status: 'read' },
        include: { drafts: { orderBy: { createdAt: 'desc' } } },
      });
      return NextResponse.json({ message: updated });
    }

    return NextResponse.json({ message });
  } catch (error) {
    console.error('Failed to get email message:', error);
    return NextResponse.json(
      { error: 'Failed to get email', message: String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as { status?: string };
    const validStatuses = ['unread', 'read', 'replied', 'archived', 'spam'];

    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Bad Request', message: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 },
      );
    }

    const updated = await prisma.emailMessage.update({
      where: { id: params.id },
      data: { ...(body.status ? { status: body.status } : {}) },
    });

    return NextResponse.json({ message: updated });
  } catch (error) {
    console.error('Failed to update email message:', error);
    return NextResponse.json(
      { error: 'Failed to update', message: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.emailMessage.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Failed to delete email message:', error);
    return NextResponse.json(
      { error: 'Failed to delete', message: String(error) },
      { status: 500 },
    );
  }
}
