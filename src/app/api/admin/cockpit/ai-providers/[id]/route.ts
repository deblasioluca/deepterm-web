import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, maskApiKey, decryptApiKey } from '@/lib/ai-encryption';
import { invalidateAICache } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

// PATCH: Update provider fields
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) data.name = body.name;
    if (body.baseUrl !== undefined) data.baseUrl = body.baseUrl || null;
    if (body.isEnabled !== undefined) data.isEnabled = body.isEnabled;
    if (body.apiKey !== undefined && body.apiKey) {
      data.encryptedKey = encryptApiKey(body.apiKey);
      data.isValid = false; // Reset validation when key changes
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const provider = await prisma.aIProvider.update({
      where: { id: params.id },
      data,
      include: { models: true },
    });

    invalidateAICache();

    return NextResponse.json({
      ...provider,
      encryptedKey: undefined,
      keyMasked: provider.encryptedKey ? maskApiKey(decryptApiKey(provider.encryptedKey)) : '',
      hasKey: !!provider.encryptedKey,
    });
  } catch (error) {
    console.error('AI provider update error:', error);
    return NextResponse.json({ error: 'Failed to update provider' }, { status: 500 });
  }
}

// DELETE: Remove provider (cascades to models and assignments)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.aIProvider.delete({ where: { id: params.id } });
    invalidateAICache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('AI provider delete error:', error);
    return NextResponse.json({ error: 'Failed to delete provider' }, { status: 500 });
  }
}
