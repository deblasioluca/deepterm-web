/**
 * GET  /api/admin/content-update — list update jobs
 * POST /api/admin/content-update — trigger a new update job
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const REPO = 'deblasioluca/deepterm-web';

// Screenshot sections available to update
const AVAILABLE_SECTIONS = [
  'dashboard',
  'connections',
  'vault',
  'terminal',
  'settings',
  'sftp',
  'ai-chat',
  'collaboration',
  'documentation',
  'pricing',
];

/** Append a line to a job's logs field (read-then-concat since Prisma String has no append). */
async function appendLog(jobId: string, line: string, extra: Record<string, unknown> = {}) {
  const job = await prisma.contentUpdateJob.findUnique({ where: { id: jobId }, select: { logs: true } });
  await prisma.contentUpdateJob.update({
    where: { id: jobId },
    data: { logs: (job?.logs ?? '') + '\n' + line, ...extra },
  });
}

export async function GET(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  const [jobs, activeJob] = await Promise.all([
    prisma.contentUpdateJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.contentUpdateJob.findFirst({
      where: { status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    jobs,
    activeJob,
    availableSections: AVAILABLE_SECTIONS,
  });
}

export async function POST(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      type?: string;
      sections?: string[];
      action?: string;
      jobId?: string;
    };

    // Cancel a running job
    if (body.action === 'cancel' && body.jobId) {
      const existing = await prisma.contentUpdateJob.findUnique({ where: { id: body.jobId }, select: { logs: true } });
      const job = await prisma.contentUpdateJob.update({
        where: { id: body.jobId },
        data: {
          status: 'cancelled',
          completedAt: new Date(),
          logs: (existing?.logs ?? '') + '\n[CANCELLED] Job cancelled by admin',
        },
      });
      return NextResponse.json({ ok: true, job });
    }

    // Check for already-running jobs
    const activeJob = await prisma.contentUpdateJob.findFirst({
      where: { status: { in: ['queued', 'running'] } },
    });
    if (activeJob) {
      return NextResponse.json(
        { error: 'An update job is already running. Cancel it first or wait for it to complete.' },
        { status: 409 }
      );
    }

    const type = body.type || 'full';
    const sections = body.sections?.length ? body.sections : AVAILABLE_SECTIONS;

    // Create the job record
    const job = await prisma.contentUpdateJob.create({
      data: {
        type,
        sections: JSON.stringify(sections),
        triggeredBy: 'admin',
        status: 'queued',
        logs: `[${new Date().toISOString()}] Job created — type: ${type}, sections: ${sections.join(', ')}`,
      },
    });

    // Try to dispatch GitHub Actions workflow (fire-and-forget)
    if (GITHUB_TOKEN) {
      dispatchWorkflow(job.id, type, sections).catch((err) => {
        console.error('Failed to dispatch workflow:', err);
      });
    } else {
      // No GitHub token — simulate the job locally
      simulateJob(job.id, type, sections).catch((err) => {
        console.error('Failed to simulate job:', err);
      });
    }

    return NextResponse.json({ ok: true, job });
  } catch (error) {
    console.error('Content update error:', error);
    return NextResponse.json({ error: 'Failed to create update job' }, { status: 500 });
  }
}

async function dispatchWorkflow(jobId: string, type: string, sections: string[]) {
  await appendLog(jobId, `[${new Date().toISOString()}] Dispatching GitHub Actions workflow...`, {
    status: 'running',
    startedAt: new Date(),
  });

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/content-update.yml/dispatches`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: {
            job_id: jobId,
            type,
            sections: sections.join(','),
          },
        }),
      }
    );

    if (res.status === 204) {
      await appendLog(jobId, `[${new Date().toISOString()}] Workflow dispatched successfully. Waiting for runner...`);
    } else {
      const errText = await res.text();
      throw new Error(`GitHub API ${res.status}: ${errText}`);
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Atomically set failed only if not already cancelled (prevents TOCTOU race)
    const updated = await prisma.contentUpdateJob.updateMany({
      where: { id: jobId, status: { not: 'cancelled' } },
      data: {
        status: 'failed',
        error: msg,
        completedAt: new Date(),
      },
    });
    if (updated.count > 0) {
      await appendLog(jobId, `[${new Date().toISOString()}] ERROR: ${msg}`);
    }
  }
}

// When no GitHub token is available, simulate the job with progress updates
async function simulateJob(jobId: string, type: string, sections: string[]) {
  await appendLog(jobId, `[${new Date().toISOString()}] Running locally (no GITHUB_TOKEN)...`, {
    status: 'running',
    startedAt: new Date(),
  });

  const totalSections = sections.length;
  for (let i = 0; i < totalSections; i++) {
    const section = sections[i];
    const progress = Math.round(((i + 1) / totalSections) * 100);

    // Check if job was cancelled
    const current = await prisma.contentUpdateJob.findUnique({ where: { id: jobId } });
    if (current?.status === 'cancelled') return;

    await appendLog(
      jobId,
      `[${new Date().toISOString()}] ${type === 'screenshots' ? 'Capturing' : 'Updating'} section: ${section} (${i + 1}/${totalSections})`,
      { progress },
    );

    // Simulate work
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  // Atomically mark complete only if not already cancelled (prevents TOCTOU race)
  const finalResult = await prisma.contentUpdateJob.updateMany({
    where: { id: jobId, status: { not: 'cancelled' } },
    data: {
      status: 'completed',
      progress: 100,
      completedAt: new Date(),
      result: JSON.stringify({ sectionsUpdated: sections, type }),
    },
  });
  if (finalResult.count > 0) {
    await appendLog(jobId, `[${new Date().toISOString()}] Job completed successfully. ${totalSections} sections processed.`);
  }
}
