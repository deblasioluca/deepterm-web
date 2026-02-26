import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: List models (optionally filter by providerId)
export async function GET(req: NextRequest) {
  try {
    const providerId = req.nextUrl.searchParams.get('providerId');
    const where = providerId ? { providerId } : {};

    const models = await prisma.aIModel.findMany({
      where,
      orderBy: [{ providerId: 'asc' }, { modelId: 'asc' }],
      include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
    });

    return NextResponse.json(models);
  } catch (error) {
    console.error('AI models list error:', error);
    return NextResponse.json({ error: 'Failed to list models' }, { status: 500 });
  }
}

// POST: Create a new model
export async function POST(req: NextRequest) {
  try {
    const { providerId, modelId, displayName, capabilities, contextWindow, costPer1kInput, costPer1kOutput } = await req.json();

    if (!providerId || !modelId || !displayName) {
      return NextResponse.json({ error: 'providerId, modelId, and displayName are required' }, { status: 400 });
    }

    const provider = await prisma.aIProvider.findUnique({ where: { id: providerId } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const model = await prisma.aIModel.create({
      data: {
        providerId,
        modelId,
        displayName,
        capabilities: capabilities ? JSON.stringify(capabilities) : '[]',
        contextWindow: contextWindow || 128000,
        costPer1kInput: costPer1kInput || 0,
        costPer1kOutput: costPer1kOutput || 0,
      },
      include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
    });

    return NextResponse.json(model);
  } catch (error) {
    console.error('AI model create error:', error);
    return NextResponse.json({ error: 'Failed to create model' }, { status: 500 });
  }
}
