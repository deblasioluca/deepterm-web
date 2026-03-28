/**
 * POST /api/admin/email/send — send an approved draft response.
 *
 * Uses the shared email transporter from src/lib/email.ts (per CLAUDE.md rules),
 * then marks the draft as "sent" and the email as "replied".
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmailReply } from '@/lib/email';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      draftId?: string;
      editedBody?: string;
    };

    if (!body.draftId) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'draftId is required' },
        { status: 400 },
      );
    }

    // Load the draft with its parent email
    const draft = await prisma.emailDraft.findUnique({
      where: { id: body.draftId },
      include: { emailMessage: true },
    });

    if (!draft) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Draft not found' },
        { status: 404 },
      );
    }

    if (draft.status === 'sent') {
      return NextResponse.json(
        { error: 'Conflict', message: 'Draft has already been sent' },
        { status: 409 },
      );
    }

    if (draft.status === 'discarded') {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Cannot send a discarded draft' },
        { status: 400 },
      );
    }

    const email = draft.emailMessage;
    const responseBody = body.editedBody || draft.editedBody || draft.draftBody;

    // Determine the reply-from address
    const fromAlias = email.to || 'support@deepterm.net';
    const fromName = fromAlias.startsWith('luca@')
      ? 'Luca — DeepTerm'
      : 'DeepTerm Support';

    // Send using Gmail API (falls back to SMTP if not configured)
    const result = await sendEmailReply({
      from: fromAlias,
      fromName,
      to: email.from,
      subject: `Re: ${email.subject}`,
      html: responseBody,
      replyTo: fromAlias,
      // Use RFC 2822 Message-ID for proper email threading
      inReplyTo: email.rfcMessageId ?? undefined,
      references: email.rfcMessageId ?? undefined,
      // Pass Gmail thread ID so the reply appears in the same conversation
      threadId: email.threadId ?? undefined,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Send Failed', message: result.error.message },
        { status: 500 },
      );
    }

    // Update draft status
    await prisma.emailDraft.update({
      where: { id: body.draftId },
      data: {
        status: 'sent',
        sentAt: new Date(),
        sentFrom: fromAlias,
        ...(body.editedBody ? { editedBody: body.editedBody } : {}),
      },
    });

    // Update email message status
    await prisma.emailMessage.update({
      where: { id: email.id },
      data: { status: 'replied' },
    });

    return NextResponse.json({
      success: true,
      sentTo: email.from,
      sentFrom: fromAlias,
    });
  } catch (error) {
    console.error('Failed to send email response:', error);
    return NextResponse.json(
      { error: 'Send Failed', message: String(error) },
      { status: 500 },
    );
  }
}
