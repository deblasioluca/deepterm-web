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
        platform: true,
        version: true,
        releaseNotes: true,
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
