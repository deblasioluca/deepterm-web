import { NextRequest, NextResponse } from 'next/server';
import { evaluateAndConvertIdea } from '@/lib/idea-evaluate';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/cockpit/ideas/evaluate
 * Evaluates an approved idea using AI with full repo context,
 * generates a detailed implementation spec, and creates a GitHub issue.
 *
 * Body: { ideaId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { ideaId } = await req.json();
    if (!ideaId) {
      return NextResponse.json({ error: 'ideaId is required' }, { status: 400 });
    }

    const result = await evaluateAndConvertIdea(ideaId);

    if (!result.ok) {
      const status = result.duplicate ? 409 : result.error === 'Idea not found' ? 404 : 500;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Idea evaluate error:', error);
    return NextResponse.json({ error: 'Failed to evaluate idea' }, { status: 500 });
  }
}
