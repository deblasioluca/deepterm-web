/**
 * GET /api/admin/email/process — cron-triggered email processing endpoint.
 *
 * Designed to be called by an external cron (e.g. every 5 minutes).
 * Polls Gmail, classifies, and performs auto-actions.
 *
 * Also supports POST for manual triggering with options.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchNewMessages } from '@/lib/gmail';
import { classifyEmail, linkEmailToUser, performAutoAction } from '@/lib/email-ai';

export const dynamic = 'force-dynamic';

async function processEmails(sinceHours: number = 1) {
  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  // Get already-processed Gmail message IDs
  const existingMessages = await prisma.emailMessage.findMany({
    select: { gmailMessageId: true },
  });
  const processedIds = new Set(existingMessages.map((m) => m.gmailMessageId));

  // Fetch new messages from Gmail
  const newMessages = await fetchNewMessages({
    sinceDate,
    processedIds,
    maxResults: 20,
  });

  let processed = 0;
  let errors = 0;

  for (const msg of newMessages) {
    try {
      // Store in database
      const emailMessage = await prisma.emailMessage.create({
        data: {
          gmailMessageId: msg.gmailMessageId,
          threadId: msg.threadId,
          from: msg.from,
          fromName: msg.fromName,
          to: msg.to,
          subject: msg.subject,
          bodyText: msg.bodyText,
          bodyHtml: msg.bodyHtml,
          receivedAt: msg.receivedAt,
          status: 'unread',
        },
      });

      // Link to existing user
      await linkEmailToUser(emailMessage.id);

      // Classify with LLM
      const classification = await classifyEmail({
        from: msg.from,
        fromName: msg.fromName,
        to: msg.to,
        subject: msg.subject,
        bodyText: msg.bodyText,
      });

      await prisma.emailMessage.update({
        where: { id: emailMessage.id },
        data: {
          classification: classification.classification,
          priority: classification.priority,
          sentiment: classification.sentiment,
          actionItems: JSON.stringify(classification.actionItems),
          classifiedAt: new Date(),
        },
      });

      // Perform auto-actions
      await performAutoAction(emailMessage.id);

      processed++;
    } catch (err) {
      console.error(`Failed to process email ${msg.gmailMessageId}:`, err);
      errors++;
    }
  }

  return { processed, errors, total: newMessages.length };
}

/** GET — cron endpoint */
export async function GET() {
  try {
    const result = await processEmails(1);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Email processing cron failed:', error);
    return NextResponse.json(
      { error: 'Processing Failed', message: String(error) },
      { status: 500 },
    );
  }
}

/** POST — manual trigger with options */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      sinceHours?: number;
    };
    const result = await processEmails(body.sinceHours ?? 24);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Email processing failed:', error);
    return NextResponse.json(
      { error: 'Processing Failed', message: String(error) },
      { status: 500 },
    );
  }
}
