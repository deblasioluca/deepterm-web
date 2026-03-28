/**
 * POST /api/admin/email/ingest — trigger email ingestion from Gmail API.
 *
 * Polls Gmail for new emails sent to deepterm.net aliases,
 * stores them in the EmailMessage table, classifies with LLM,
 * and performs auto-actions based on classification.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fetchNewMessages } from '@/lib/gmail';
import { classifyEmail, detectEscalation, draftResponse, linkEmailToUser, performAutoAction } from '@/lib/email-ai';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      sinceHours?: number;
      classify?: boolean;
      autoAction?: boolean;
      autoDraft?: boolean;
    };

    const sinceHours = body.sinceHours ?? 24;
    const shouldClassify = body.classify !== false; // default true
    const shouldAutoAction = body.autoAction !== false; // default true
    const shouldAutoDraft = body.autoDraft !== false; // default true

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
      maxResults: 50,
    });

    const results: Array<{
      id: string;
      subject: string;
      classification?: string;
      action?: string;
      drafted?: boolean;
      error?: string;
    }> = [];

    for (const msg of newMessages) {
      try {
        // Store in database
        const emailMessage = await prisma.emailMessage.create({
          data: {
            gmailMessageId: msg.gmailMessageId,
            rfcMessageId: msg.rfcMessageId,
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

        let classification: string | undefined;
        let action: string | undefined;

        // Link to existing user
        await linkEmailToUser(emailMessage.id);

        // Classify with LLM
        if (shouldClassify) {
          const result = await classifyEmail({
            from: msg.from,
            fromName: msg.fromName,
            to: msg.to,
            subject: msg.subject,
            bodyText: msg.bodyText,
          });

          await prisma.emailMessage.update({
            where: { id: emailMessage.id },
            data: {
              classification: result.classification,
              priority: result.priority,
              sentiment: result.sentiment,
              actionItems: JSON.stringify(result.actionItems),
              classifiedAt: new Date(),
            },
          });

          classification = result.classification;

          // Perform auto-actions
          if (shouldAutoAction) {
            const actionResult = await performAutoAction(emailMessage.id);
            action = actionResult.action;
          }
        }

        // Check for escalation keywords — flag for human review
        const needsHuman = detectEscalation(msg.bodyText);
        if (needsHuman) {
          await prisma.emailMessage.update({
            where: { id: emailMessage.id },
            data: { status: 'needs_human' },
          });
        }

        // Auto-draft response for non-spam, non-escalated emails
        let drafted = false;
        if (shouldAutoDraft && !needsHuman && classification && classification !== 'spam') {
          try {
            const draft = await draftResponse(emailMessage.id);
            await prisma.emailDraft.create({
              data: {
                emailMessageId: emailMessage.id,
                draftBody: draft.draftBody,
                draftText: draft.draftText,
                model: draft.model,
                inputTokens: draft.inputTokens,
                outputTokens: draft.outputTokens,
                costCents: draft.costCents,
                status: 'pending',
              },
            });
            drafted = true;
          } catch (draftErr) {
            console.error(`Auto-draft failed for ${emailMessage.id}:`, draftErr);
          }
        }

        results.push({
          id: emailMessage.id,
          subject: msg.subject,
          classification,
          action,
          drafted,
        });
      } catch (err) {
        results.push({
          id: msg.gmailMessageId,
          subject: msg.subject,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const successCount = results.filter((r) => !r.error).length;
    const errorCount = results.filter((r) => r.error).length;

    return NextResponse.json({
      success: true,
      ingested: successCount,
      errors: errorCount,
      total: newMessages.length,
      skipped: processedIds.size,
      results,
    });
  } catch (error) {
    console.error('Email ingestion failed:', error);
    return NextResponse.json(
      { error: 'Ingestion Failed', message: String(error) },
      { status: 500 },
    );
  }
}
