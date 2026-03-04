import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { prisma } from '@/lib/prisma';

// GET /api/admin/ai/conversations — list conversations for the current admin
export async function GET(request: Request) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1'));
  const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20')));
  const skip = (page - 1) * limit;

  const [conversations, total] = await Promise.all([
    prisma.adminAIConversation.findMany({
      where: { adminUserId: session.id },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        title: true,
        pageContext: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    prisma.adminAIConversation.count({ where: { adminUserId: session.id } }),
  ]);

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title ?? 'Untitled',
      page: c.pageContext ? (JSON.parse(c.pageContext) as { page?: string }).page ?? null : null,
      messageCount: c._count.messages,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}
