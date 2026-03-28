/**
 * POST /api/admin/email/send — send an approved draft response.
 *
 * Uses Nodemailer (existing email.ts infrastructure) to send the reply,
 * then marks the draft as "sent" and the email as "replied".
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import nodemailer from 'nodemailer';

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

    const email = draft.emailMessage;
    const responseBody = body.editedBody || draft.editedBody || draft.draftBody;

    // Determine the reply-from address
    const fromAlias = email.to || 'support@deepterm.net';
    const fromName = fromAlias.startsWith('luca@')
      ? 'Luca — DeepTerm'
      : 'DeepTerm Support';

    // Create transporter using existing SMTP config
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    // Send the email
    await transporter.sendMail({
      from: `"${fromName}" <${process.env.SMTP_USER || fromAlias}>`,
      replyTo: fromAlias,
      to: email.from,
      subject: `Re: ${email.subject}`,
      html: responseBody,
      headers: {
        ...(email.gmailMessageId ? { 'In-Reply-To': email.gmailMessageId } : {}),
        ...(email.threadId ? { References: email.threadId } : {}),
      },
    });

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
