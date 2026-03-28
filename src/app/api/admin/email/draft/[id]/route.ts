/**
 * PATCH  /api/admin/email/draft/[id] — update draft (edit body, approve, discard)
 * DELETE /api/admin/email/draft/[id] — delete a draft
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const body = (await request.json()) as {
      status?: string;
      editedBody?: string;
    };

    const validStatuses = ['pending', 'approved', 'sent', 'discarded'];
    if (body.status && !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Bad Request', message: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 },
      );
    }

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.editedBody !== undefined) data.editedBody = body.editedBody;

    const updated = await prisma.emailDraft.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json({ draft: updated });
  } catch (error) {
    console.error('Failed to update draft:', error);
    return NextResponse.json(
      { error: 'Failed to update draft', message: String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    await prisma.emailDraft.delete({ where: { id: params.id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Failed to delete draft:', error);
    return NextResponse.json(
      { error: 'Failed to delete draft', message: String(error) },
      { status: 500 },
    );
  }
}
