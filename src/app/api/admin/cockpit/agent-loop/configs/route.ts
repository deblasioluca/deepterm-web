import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// GET: List all agent loop configs
export async function GET() {
  try {
    const configs = await prisma.agentLoopConfig.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { loops: true } },
      },
    });
    return NextResponse.json(configs);
  } catch (error) {
    console.error('Agent loop config list error:', error);
    return NextResponse.json({ error: 'Failed to list configs' }, { status: 500 });
  }
}

// POST: Create a new config
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      description,
      provider,
      model,
      maxIterations,
      targetRepo,
      targetBranch,
      allowedPaths,
      forbiddenPaths,
      systemPrompt,
      autoCreatePR,
      requireTests,
      requireBuild,
    } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Check uniqueness
    const existing = await prisma.agentLoopConfig.findUnique({ where: { name } });
    if (existing) {
      return NextResponse.json({ error: 'Config name already exists' }, { status: 409 });
    }

    const config = await prisma.agentLoopConfig.create({
      data: {
        name,
        description: description || '',
        provider: provider || 'anthropic',
        model: model || 'claude-sonnet-4-20250514',
        maxIterations: maxIterations || 10,
        targetRepo: targetRepo || 'deblasioluca/deepterm',
        targetBranch: targetBranch || 'main',
        allowedPaths: JSON.stringify(allowedPaths || []),
        forbiddenPaths: JSON.stringify(forbiddenPaths || []),
        systemPrompt: systemPrompt || '',
        autoCreatePR: autoCreatePR ?? true,
        requireTests: requireTests ?? true,
        requireBuild: requireBuild ?? true,
      },
    });

    return NextResponse.json(config, { status: 201 });
  } catch (error) {
    console.error('Agent loop config create error:', error);
    return NextResponse.json({ error: 'Failed to create config' }, { status: 500 });
  }
}

// PATCH: Update a config
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'Config id is required' }, { status: 400 });
    }

    // Serialize arrays if provided
    if (updates.allowedPaths && Array.isArray(updates.allowedPaths)) {
      updates.allowedPaths = JSON.stringify(updates.allowedPaths);
    }
    if (updates.forbiddenPaths && Array.isArray(updates.forbiddenPaths)) {
      updates.forbiddenPaths = JSON.stringify(updates.forbiddenPaths);
    }

    const config = await prisma.agentLoopConfig.update({
      where: { id },
      data: updates,
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error('Agent loop config update error:', error);
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 });
  }
}
