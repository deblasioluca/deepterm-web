import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { continueIdeaTriage } from '@/lib/ai-triage';

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

  const idea = await prisma.idea.findUnique({
    where: { id: params.id },
    select: { id: true },
  });

  if (!idea) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  await prisma.ideaComment.create({
    data: {
      ideaId: params.id,
      authorType: 'user',
      authorName: session.user.name || session.user.email || 'User',
      authorEmail: session.user.email || undefined,
      message,
    },
  });

  // Continue AI triage conversation if active (fire-and-forget)
  continueIdeaTriage(params.id).catch((err) => console.error('[AI Triage] Continue error:', err));

  return NextResponse.json({ success: true });
}
