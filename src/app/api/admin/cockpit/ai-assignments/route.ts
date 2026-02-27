import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AI_ACTIVITIES } from '@/lib/ai-activities';
import { invalidateAICache } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';

// GET: List all activities with their current assignments
export async function GET() {
  try {
    const assignments = await prisma.aIActivityAssignment.findMany({
      include: {
        model: {
          include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
        },
        secondaryModel: {
          include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
        },
        tertiaryModel: {
          include: { provider: { select: { name: true, slug: true, isEnabled: true } } },
        },
      },
    });

    const assignmentMap = new Map(assignments.map(a => [a.activity, a]));

    const result = Object.entries(AI_ACTIVITIES).map(([key, activity]) => {
      const assignment = assignmentMap.get(key);
      return {
        ...activity,
        assignment: assignment ? {
          id: assignment.id,
          modelId: assignment.modelId,
          modelDisplayName: assignment.model.displayName,
          modelModelId: assignment.model.modelId,
          providerName: assignment.model.provider.name,
          providerSlug: assignment.model.provider.slug,
          temperature: assignment.temperature,
          maxTokens: assignment.maxTokens,
          systemPromptOverride: assignment.systemPromptOverride || null,
          secondaryModelId: assignment.secondaryModelId || null,
          secondaryModelDisplayName: assignment.secondaryModel?.displayName || null,
          tertiaryModelId: assignment.tertiaryModelId || null,
          tertiaryModelDisplayName: assignment.tertiaryModel?.displayName || null,
        } : null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('AI assignments list error:', error);
    return NextResponse.json({ error: 'Failed to list assignments' }, { status: 500 });
  }
}

// PATCH: Bulk update assignments
export async function PATCH(req: NextRequest) {
  try {
    const { assignments } = await req.json();

    if (!Array.isArray(assignments)) {
      return NextResponse.json({ error: 'assignments array is required' }, { status: 400 });
    }

    for (const item of assignments) {
      const { activity, modelId, temperature, maxTokens, systemPromptOverride, secondaryModelId, tertiaryModelId } = item;

      if (!activity || !(activity in AI_ACTIVITIES)) {
        continue; // Skip unknown activities
      }

      const hasAnyModel = modelId || secondaryModelId || tertiaryModelId;
      if (!hasAnyModel) {
        // Remove assignment (revert to default) — only if no models at all
        await prisma.aIActivityAssignment.deleteMany({ where: { activity } });
      } else {
        // Upsert assignment
        const data: Record<string, unknown> = { modelId: modelId || secondaryModelId || tertiaryModelId };
        if (temperature !== undefined) data.temperature = temperature;
        if (maxTokens !== undefined) data.maxTokens = maxTokens;
        if (systemPromptOverride !== undefined) data.systemPromptOverride = systemPromptOverride || null;
        if (secondaryModelId !== undefined) data.secondaryModelId = secondaryModelId || null;
        if (tertiaryModelId !== undefined) data.tertiaryModelId = tertiaryModelId || null;

        await prisma.aIActivityAssignment.upsert({
          where: { activity },
          create: {
            activity,
            modelId: modelId || secondaryModelId || tertiaryModelId,
            temperature: temperature ?? 0.7,
            maxTokens: maxTokens ?? 4096,
            systemPromptOverride: systemPromptOverride || null,
            secondaryModelId: secondaryModelId || null,
            tertiaryModelId: tertiaryModelId || null,
          },
          update: data,
        });
      }
    }

    invalidateAICache();
    return NextResponse.json({ ok: true, updated: assignments.length });
  } catch (error) {
    console.error('AI assignments update error:', error);
    return NextResponse.json({ error: 'Failed to update assignments' }, { status: 500 });
  }
}
