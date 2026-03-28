/**
 * POST /api/admin/email/draft — generate an LLM response draft for an email.
 * GET  /api/admin/email/draft — list all drafts (optionally filtered by status).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { draftResponse } from '@/lib/email-ai';

export const dynamic = 'force-dynamic';

/** POST — generate a new draft for a specific email message */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { emailMessageId?: string };

    if (!body.emailMessageId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'emailMessageId is required' },
        { status: 400 },
      );
    }

    // Check email exists
    const email = await prisma.emailMessage.findUnique({
      where: { id: body.emailMessageId },
    });
    if (!email) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Email message not found' },
        { status: 404 },
      );
    }

    // Generate draft via LLM
    const result = await draftResponse(body.emailMessageId);

    // Save draft to database
    const draft = await prisma.emailDraft.create({
      data: {
        emailMessageId: body.emailMessageId,
        draftBody: result.draftBody,
        draftText: result.draftText,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costCents: result.costCents,
        status: 'pending',
      },
    });

    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    console.error('Failed to generate email draft:', error);
    return NextResponse.json(
      { error: 'Draft Generation Failed', message: String(error) },
      { status: 500 },
    );
  }
}

/** GET — list all drafts, optionally filtered */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const drafts = await prisma.emailDraft.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        emailMessage: {
          select: {
            id: true,
            from: true,
            fromName: true,
            to: true,
            subject: true,
            classification: true,
            priority: true,
            receivedAt: true,
          },
        },
      },
    });

    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Failed to list drafts:', error);
    return NextResponse.json(
      { error: 'Failed to list drafts', message: String(error) },
      { status: 500 },
    );
  }
}
