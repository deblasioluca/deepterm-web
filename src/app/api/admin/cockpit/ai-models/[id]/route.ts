import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { invalidateAICache } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

// PATCH: Update model fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.displayName !== undefined) data.displayName = body.displayName;
    if (body.capabilities !== undefined) data.capabilities = JSON.stringify(body.capabilities);
    if (body.contextWindow !== undefined) data.contextWindow = body.contextWindow;
    if (body.costPer1kInput !== undefined) data.costPer1kInput = body.costPer1kInput;
    if (body.costPer1kOutput !== undefined) data.costPer1kOutput = body.costPer1kOutput;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const model = await prisma.aIModel.update({
      where: { id: params.id },
      data,
      include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
    });

    invalidateAICache();
    return NextResponse.json(model);
  } catch (error) {
    console.error('AI model update error:', error);
    return NextResponse.json({ error: 'Failed to update model' }, { status: 500 });
  }
}

// DELETE: Remove model (cascades to assignments)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.aIModel.delete({ where: { id: params.id } });
    invalidateAICache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('AI model delete error:', error);
    return NextResponse.json({ error: 'Failed to delete model' }, { status: 500 });
  }
}
