/**
 * POST /api/admin/content-update/webhook
 *
 * Webhook endpoint for CI/CD integration.
 * Accepts callbacks from GitHub Actions to update job status/progress.
 * Also accepts external triggers (with secret token).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const WEBHOOK_SECRET = process.env.CONTENT_UPDATE_WEBHOOK_SECRET || '';

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return WEBHOOK_SECRET !== '' && token === WEBHOOK_SECRET;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      action: string;
      jobId?: string;
      type?: string;
      sections?: string[];
      progress?: number;
      logs?: string;
      error?: string;
      result?: string;
      workflowRunId?: string;
    };

    switch (body.action) {
      // External trigger (from CI/CD or webhook)
      case 'trigger': {
        const activeJob = await prisma.contentUpdateJob.findFirst({
          where: { status: { in: ['queued', 'running'] } },
        });
        if (activeJob) {
          return NextResponse.json(
            { error: 'An update job is already running' },
            { status: 409 }
          );
        }

        const type = body.type || 'full';
        const sections = body.sections || [];

        const job = await prisma.contentUpdateJob.create({
          data: {
            type,
            sections: JSON.stringify(sections),
            triggeredBy: 'webhook',
            status: 'queued',
            logs: `[${new Date().toISOString()}] Job triggered via webhook — type: ${type}`,
          },
        });

        return NextResponse.json({ ok: true, jobId: job.id });
      }

      // Update job progress (from GitHub Actions runner)
      case 'progress': {
        if (!body.jobId) {
          return NextResponse.json({ error: 'jobId required' }, { status: 400 });
        }

        const existing = await prisma.contentUpdateJob.findUnique({ where: { id: body.jobId } });
        if (!existing) {
          return NextResponse.json({ error: 'Job not found' }, { status: 404 });
        }

        const updateData: Record<string, unknown> = {};
        if (body.progress !== undefined) updateData.progress = body.progress;
        if (body.logs) updateData.logs = (existing.logs ?? '') + '\n' + body.logs;
        if (body.workflowRunId) updateData.workflowRunId = body.workflowRunId;

        // Auto-transition to running
        if (body.progress !== undefined && body.progress > 0) {
          updateData.status = 'running';
          if (!existing.startedAt) {
            updateData.startedAt = new Date();
          }
        }

        await prisma.contentUpdateJob.update({
          where: { id: body.jobId },
          data: updateData,
        });

        return NextResponse.json({ ok: true });
      }

      // Mark job complete
      case 'complete': {
        if (!body.jobId) {
          return NextResponse.json({ error: 'jobId required' }, { status: 400 });
        }

        let logsUpdate: string | undefined;
        if (body.logs) {
          const prev = await prisma.contentUpdateJob.findUnique({ where: { id: body.jobId }, select: { logs: true } });
          logsUpdate = (prev?.logs ?? '') + '\n' + body.logs;
        }

        await prisma.contentUpdateJob.update({
          where: { id: body.jobId },
          data: {
            status: 'completed',
            progress: 100,
            completedAt: new Date(),
            result: body.result || null,
            ...(logsUpdate !== undefined ? { logs: logsUpdate } : {}),
          },
        });

        return NextResponse.json({ ok: true });
      }

      // Mark job failed
      case 'fail': {
        if (!body.jobId) {
          return NextResponse.json({ error: 'jobId required' }, { status: 400 });
        }

        let failLogsUpdate: string | undefined;
        if (body.logs) {
          const prev = await prisma.contentUpdateJob.findUnique({ where: { id: body.jobId }, select: { logs: true } });
          failLogsUpdate = (prev?.logs ?? '') + '\n' + body.logs;
        }

        await prisma.contentUpdateJob.update({
          where: { id: body.jobId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            error: body.error || 'Unknown error',
            ...(failLogsUpdate !== undefined ? { logs: failLogsUpdate } : {}),
          },
        });

        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${body.action}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Content update webhook error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
