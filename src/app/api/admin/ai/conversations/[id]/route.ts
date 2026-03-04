import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

type RouteParams = { params: { id: string } };

// GET /api/admin/ai/conversations/:id
export async function GET(_request: Request, { params }: RouteParams) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversation = await prisma.adminAIConversation.findFirst({
    where: { id: params.id, adminUserId: session.id },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title ?? 'Untitled',
    pageContext: conversation.pageContext ? JSON.parse(conversation.pageContext) : null,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    messages: conversation.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : null,
      toolResults: m.toolResults ? JSON.parse(m.toolResults) : null,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      costCents: m.costCents,
      createdAt: m.createdAt,
    })),
  });
}

// DELETE /api/admin/ai/conversations/:id
export async function DELETE(_request: Request, { params }: RouteParams) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conversation = await prisma.adminAIConversation.findFirst({
    where: { id: params.id, adminUserId: session.id },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  await prisma.adminAIConversation.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true });
}

// PATCH /api/admin/ai/conversations/:id — rename title
export async function PATCH(request: Request, { params }: RouteParams) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as unknown;
  const parsed = z.object({ title: z.string().min(1).max(120) }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad Request', message: parsed.error.message }, { status: 400 });
  }

  const conversation = await prisma.adminAIConversation.findFirst({
    where: { id: params.id, adminUserId: session.id },
  });
  if (!conversation) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const updated = await prisma.adminAIConversation.update({
    where: { id: params.id },
    data: { title: parsed.data.title },
  });
  return NextResponse.json({ id: updated.id, title: updated.title });
}
