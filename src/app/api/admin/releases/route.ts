import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const releases = await prisma.release.findMany({
      select: {
        id: true,
        platform: true,
        version: true,
        releaseNotes: true,
        sha256: true,
        minimumOSVersion: true,
        mandatory: true,
        published: true,
        filePath: true,
        fileFilename: true,
        sizeBytes: true,
        publishedAt: true,
        createdBy: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    return NextResponse.json({ releases });
  } catch (error) {
    console.error('Failed to list releases (admin):', error);
    return NextResponse.json({ error: 'Failed to list releases' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, published } = body;

    if (!id || typeof published !== 'boolean') {
      return NextResponse.json({ error: 'Bad Request', message: 'id and published (boolean) are required' }, { status: 400 });
    }

    const release = await prisma.release.update({
      where: { id },
      data: { published },
    });

    return NextResponse.json({ success: true, release: { id: release.id, published: release.published, version: release.version } });
  } catch (error) {
    console.error('Failed to update release:', error);
    return NextResponse.json({ error: 'Failed to update release' }, { status: 500 });
  }
}
