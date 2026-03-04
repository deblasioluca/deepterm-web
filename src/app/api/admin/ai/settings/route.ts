/**
 * Admin AI Settings API
 *
 * GET  /api/admin/ai/settings — read AdminAIConfig singleton (masks secrets)
 * PUT  /api/admin/ai/settings — update config (encrypts secrets)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { encryptApiKey, decryptApiKey, maskApiKey } from '@/lib/ai-encryption';
import { z } from 'zod';

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(_request: Request) {
  const admin = getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const config = await prisma.adminAIConfig.findUnique({
      where: { id: 'singleton' },
    });

    if (!config) {
      // Return defaults
      return NextResponse.json({
        modelId: 'claude-opus-4-6',
        systemPrompt: null,
        additionalPrompts: [],
        toolPermissions: {},
        hasGithubPat: false,
        githubPatMasked: null,
        hasVoyageApiKey: false,
        voyageApiKeyMasked: null,
        maxTokensPerMessage: 8000,
        conversationTtlDays: 30,
        sshMachines: [],
      });
    }

    let githubPatMasked: string | null = null;
    let voyageApiKeyMasked: string | null = null;

    if (config.githubPat) {
      try {
        const plain = decryptApiKey(config.githubPat);
        githubPatMasked = maskApiKey(plain);
      } catch {
        githubPatMasked = '(decryption error)';
      }
    }

    if (config.voyageApiKey) {
      try {
        const plain = decryptApiKey(config.voyageApiKey);
        voyageApiKeyMasked = maskApiKey(plain);
      } catch {
        voyageApiKeyMasked = '(decryption error)';
      }
    }

    return NextResponse.json({
      modelId: config.modelId,
      systemPrompt: config.systemPrompt,
      additionalPrompts: config.additionalPrompts
        ? JSON.parse(config.additionalPrompts)
        : [],
      toolPermissions: config.toolPermissions
        ? JSON.parse(config.toolPermissions)
        : {},
      hasGithubPat: !!config.githubPat,
      githubPatMasked,
      hasVoyageApiKey: !!config.voyageApiKey,
      voyageApiKeyMasked,
      maxTokensPerMessage: config.maxTokensPerMessage,
      conversationTtlDays: config.conversationTtlDays,
      sshMachines: config.sshMachines ? JSON.parse(config.sshMachines) : [],
    });
  } catch (error) {
    console.error('[admin/ai/settings] GET error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

const PutSchema = z.object({
  modelId: z.string().optional(),
  systemPrompt: z.string().nullable().optional(),
  additionalPrompts: z.array(z.object({
    name: z.string(),
    content: z.string(),
    shortcut: z.string().optional(),
  })).optional(),
  toolPermissions: z.record(z.boolean()).optional(),
  githubPat: z.string().optional(),       // new PAT value (plain)
  clearGithubPat: z.boolean().optional(), // set true to remove
  voyageApiKey: z.string().optional(),    // new Voyage key value (plain)
  clearVoyageApiKey: z.boolean().optional(),
  maxTokensPerMessage: z.number().int().min(1024).max(64000).optional(),
  conversationTtlDays: z.number().int().min(1).max(365).optional(),
  sshMachines: z.array(z.object({
    id: z.string(),
    host: z.string(),
    user: z.string(),
    label: z.string(),
  })).optional(),
});

export async function PUT(request: Request) {
  const admin = getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const update: Record<string, unknown> = {};

    if (data.modelId !== undefined) update.modelId = data.modelId;
    if (data.systemPrompt !== undefined) update.systemPrompt = data.systemPrompt;
    if (data.additionalPrompts !== undefined)
      update.additionalPrompts = JSON.stringify(data.additionalPrompts);
    if (data.toolPermissions !== undefined)
      update.toolPermissions = JSON.stringify(data.toolPermissions);
    if (data.maxTokensPerMessage !== undefined)
      update.maxTokensPerMessage = data.maxTokensPerMessage;
    if (data.conversationTtlDays !== undefined)
      update.conversationTtlDays = data.conversationTtlDays;
    if (data.sshMachines !== undefined)
      update.sshMachines = JSON.stringify(data.sshMachines);

    // GitHub PAT
    if (data.clearGithubPat) {
      update.githubPat = null;
    } else if (data.githubPat && data.githubPat.trim()) {
      update.githubPat = encryptApiKey(data.githubPat.trim());
    }

    // Voyage API key
    if (data.clearVoyageApiKey) {
      update.voyageApiKey = null;
    } else if (data.voyageApiKey && data.voyageApiKey.trim()) {
      update.voyageApiKey = encryptApiKey(data.voyageApiKey.trim());
    }

    await prisma.adminAIConfig.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', ...update },
      update,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/ai/settings] PUT error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
