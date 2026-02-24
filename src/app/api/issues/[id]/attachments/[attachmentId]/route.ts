import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; attachmentId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const issue = await prisma.issue.findUnique({
    where: { id: params.id },
    select: { userId: true },
  });

  if (!issue || issue.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const attachment = await prisma.issueAttachment.findUnique({
    where: { id: params.attachmentId },
    select: {
      issueId: true,
      originalFilename: true,
      mimeType: true,
      storagePath: true,
      sizeBytes: true,
    },
  });

  if (!attachment || attachment.issueId !== params.id) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    const filePath = attachment.storagePath;
    const baseName = path.basename(filePath);
    const buf = await fs.readFile(filePath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Length': String(attachment.sizeBytes || buf.byteLength),
        'Content-Disposition': `attachment; filename="${attachment.originalFilename || baseName}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
}
