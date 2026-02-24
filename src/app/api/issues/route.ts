import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getIssuesStorageDir, normalizeIssueArea } from '@/lib/issues';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_SCREENSHOTS = 5;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total attachments

function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function randomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issues = await prisma.issue.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      title: true,
      area: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  return NextResponse.json({ issues });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const title = (formData.get('title')?.toString() || '').trim();
  const description = (formData.get('description')?.toString() || '').trim();
  const areaRaw = formData.get('area')?.toString();
  const area = normalizeIssueArea(areaRaw);

  if (!title) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }

  const screenshotFiles = formData.getAll('screenshots').filter((v) => v instanceof File) as File[];
  const logFile = formData.get('log') instanceof File ? (formData.get('log') as File) : null;

  if (screenshotFiles.length > MAX_SCREENSHOTS) {
    return NextResponse.json({ error: `Too many screenshots (max ${MAX_SCREENSHOTS}).` }, { status: 400 });
  }

  let totalBytes = 0;
  for (const f of screenshotFiles) totalBytes += f.size;
  if (logFile) totalBytes += logFile.size;

  if (totalBytes > MAX_TOTAL_BYTES) {
    return NextResponse.json({ error: 'Attachments too large (max 25MB total).' }, { status: 400 });
  }

  for (const f of screenshotFiles) {
    if (f.size <= 0) return NextResponse.json({ error: 'One of the screenshots is empty.' }, { status: 400 });
    if (!isImageMime(f.type || '')) {
      return NextResponse.json({ error: 'Screenshots must be image files.' }, { status: 400 });
    }
  }

  if (logFile && logFile.size <= 0) {
    return NextResponse.json({ error: 'Log file is empty.' }, { status: 400 });
  }

  const issue = await prisma.issue.create({
    data: {
      userId: session.user.id,
      title,
      description,
      area,
      status: 'open',
    },
    select: { id: true },
  });

  const storageRoot = getIssuesStorageDir();
  const issueDir = path.join(storageRoot, issue.id);
  await ensureDir(issueDir);

  const attachments: Array<{
    kind: 'screenshot' | 'log';
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    storagePath: string;
  }> = [];

  for (const f of screenshotFiles) {
    const ext = path.extname(f.name || '') || '.bin';
    const name = `screenshot-${randomId()}${ext}`;
    const dest = path.join(issueDir, name);
    const buf = Buffer.from(await f.arrayBuffer());
    await fs.writeFile(dest, buf);
    attachments.push({
      kind: 'screenshot',
      originalFilename: f.name || name,
      mimeType: f.type || 'application/octet-stream',
      sizeBytes: f.size,
      storagePath: dest,
    });
  }

  if (logFile) {
    const ext = path.extname(logFile.name || '') || '.log';
    const name = `log-${randomId()}${ext}`;
    const dest = path.join(issueDir, name);
    const buf = Buffer.from(await logFile.arrayBuffer());
    await fs.writeFile(dest, buf);
    attachments.push({
      kind: 'log',
      originalFilename: logFile.name || name,
      mimeType: logFile.type || 'application/octet-stream',
      sizeBytes: logFile.size,
      storagePath: dest,
    });
  }

  if (attachments.length) {
    await prisma.issueAttachment.createMany({
      data: attachments.map((a) => ({
        issueId: issue.id,
        kind: a.kind,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        storagePath: a.storagePath,
      })),
    });
  }

  await prisma.issueUpdate.create({
    data: {
      issueId: issue.id,
      authorType: 'user',
      authorEmail: session.user.email || undefined,
      message: 'Issue submitted.',
      status: 'open',
    },
  });

  return NextResponse.json({ success: true, id: issue.id });
}
