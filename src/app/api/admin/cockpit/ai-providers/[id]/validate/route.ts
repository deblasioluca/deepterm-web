import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { decryptApiKey } from '@/lib/ai-encryption';

export const dynamic = 'force-dynamic';

// POST: Validate provider API key
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const provider = await prisma.aIProvider.findUnique({ where: { id: params.id } });
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    if (!provider.encryptedKey) {
      return NextResponse.json({ valid: false, error: 'No API key configured' });
    }

    const apiKey = decryptApiKey(provider.encryptedKey);
    let valid = false;
    let error: string | undefined;

    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 15000);

    try {
      switch (provider.slug) {
        case 'anthropic': {
          const { default: Anthropic } = await import('@anthropic-ai/sdk');
          const client = new Anthropic({ apiKey });
          await client.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          });
          valid = true;
          break;
        }
        case 'openai': {
          const res = await fetch('https://api.openai.com/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          valid = res.ok;
          if (!valid) error = `HTTP ${res.status}`;
          break;
        }
        case 'google': {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
            { signal: ctrl.signal }
          );
          valid = res.ok;
          if (!valid) error = `HTTP ${res.status}`;
          break;
        }
        case 'mistral': {
          const res = await fetch('https://api.mistral.ai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          valid = res.ok;
          if (!valid) error = `HTTP ${res.status}`;
          break;
        }
        case 'groq': {
          const res = await fetch('https://api.groq.com/openai/v1/models', {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: ctrl.signal,
          });
          valid = res.ok;
          if (!valid) error = `HTTP ${res.status}`;
          break;
        }
        default:
          error = `Unknown provider slug: ${provider.slug}`;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Validation failed';
    } finally {
      clearTimeout(tid);
    }

    await prisma.aIProvider.update({
      where: { id: params.id },
      data: { isValid: valid, lastValidated: new Date() },
    });

    return NextResponse.json({ valid, error });
  } catch (error) {
    console.error('AI provider validate error:', error);
    return NextResponse.json({ error: 'Failed to validate provider' }, { status: 500 });
  }
}
