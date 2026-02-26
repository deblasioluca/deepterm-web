import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai-encryption';

export const dynamic = 'force-dynamic';

type AvailableModel = {
  modelId: string;
  displayName: string;
};

// GET: Fetch available models from provider's API
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const provider = await prisma.aIProvider.findUnique({ where: { id: params.id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    if (!provider.encryptedKey) {
      return NextResponse.json({ error: 'No API key configured' }, { status: 400 });
    }

    const apiKey = decryptApiKey(provider.encryptedKey);
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);

    let models: AvailableModel[] = [];

    try {
      switch (provider.slug) {
        case 'anthropic': {
          const res = await fetch('https://api.anthropic.com/v1/models?limit=100', {
            headers: {
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
            },
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`Anthropic API returned ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: { id: string; display_name?: string }) => ({
            modelId: m.id,
            displayName: m.display_name || m.id,
          }));
          break;
        }
        case 'openai': {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`OpenAI API returned ${res.status}`);
          const data = await res.json();
          // Filter to chat-capable models (gpt-*, o1-*, o3-*, o4-*)
          const chatPrefixes = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'chatgpt'];
          models = (data.data || [])
            .filter((m: { id: string }) => chatPrefixes.some(p => m.id.startsWith(p)))
            .map((m: { id: string }) => ({
              modelId: m.id,
              displayName: m.id,
            }));
          break;
        }
        case 'google': {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { signal: ctrl.signal }
          );
          if (!res.ok) throw new Error(`Google API returned ${res.status}`);
          const data = await res.json();
          models = (data.models || [])
            .filter((m: { name: string; supportedGenerationMethods?: string[] }) =>
              m.supportedGenerationMethods?.includes('generateContent')
            )
            .map((m: { name: string; displayName?: string }) => ({
              modelId: m.name.replace('models/', ''),
              displayName: m.displayName || m.name.replace('models/', ''),
            }));
          break;
        }
        case 'mistral': {
          const res = await fetch('https://api.mistral.ai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`Mistral API returned ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: { id: string }) => ({
            modelId: m.id,
            displayName: m.id,
          }));
          break;
        }
        case 'groq': {
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          if (!res.ok) throw new Error(`Groq API returned ${res.status}`);
          const data = await res.json();
          models = (data.data || []).map((m: { id: string }) => ({
            modelId: m.id,
            displayName: m.id,
          }));
          break;
        }
        default:
          return NextResponse.json({ error: `Unknown provider: ${provider.slug}` }, { status: 400 });
      }
    } finally {
      clearTimeout(tid);
    }

    // Sort alphabetically
    models.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return NextResponse.json({ models });
  } catch (error) {
    console.error('AI provider models fetch error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to fetch models';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
