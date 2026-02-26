import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { encryptApiKey, maskApiKey, decryptApiKey } from '@/lib/ai-encryption';

export const dynamic = 'force-dynamic';

// GET: List all providers (API keys masked)
export async function GET() {
  try {
    const providers = await prisma.aIProvider.findMany({
      orderBy: { createdAt: 'asc' },
      include: { models: { orderBy: { modelId: 'asc' } } },
    });

    const masked = providers.map(p => ({
      ...p,
      encryptedKey: undefined,
      keyMasked: p.encryptedKey ? maskApiKey(decryptApiKey(p.encryptedKey)) : '',
      hasKey: !!p.encryptedKey,
    }));

    return NextResponse.json(masked);
  } catch (error) {
    console.error('AI providers list error:', error);
    return NextResponse.json({ error: 'Failed to list providers' }, { status: 500 });
  }
}

// POST: Create a new provider
export async function POST(req: NextRequest) {
  try {
    const { name, slug, apiKey, baseUrl } = await req.json();

    if (!name || !slug) {
      return NextResponse.json({ error: 'name and slug are required' }, { status: 400 });
    }

    const validSlugs = ['anthropic', 'openai', 'google', 'mistral', 'groq'];
    if (!validSlugs.includes(slug)) {
      return NextResponse.json({ error: `slug must be one of: ${validSlugs.join(', ')}` }, { status: 400 });
    }

    const existing = await prisma.aIProvider.findUnique({ where: { slug } });
    if (existing) {
      return NextResponse.json({ error: `Provider with slug "${slug}" already exists` }, { status: 409 });
    }

    const provider = await prisma.aIProvider.create({
      data: {
        name,
        slug,
        encryptedKey: apiKey ? encryptApiKey(apiKey) : '',
        baseUrl: baseUrl || null,
      },
    });

    return NextResponse.json({
      ...provider,
      encryptedKey: undefined,
      keyMasked: apiKey ? maskApiKey(apiKey) : '',
      hasKey: !!apiKey,
    });
  } catch (error) {
    console.error('AI provider create error:', error);
    return NextResponse.json({ error: 'Failed to create provider' }, { status: 500 });
  }
}
