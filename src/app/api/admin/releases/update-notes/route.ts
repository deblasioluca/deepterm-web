import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeVersionSlug(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function POST(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const platformRaw = typeof body?.platform === 'string' ? body.platform.trim() : '';
    const platform = platformRaw.toLowerCase();
    const version = typeof body?.version === 'string' ? body.version.trim() : '';
    const releaseNotes = typeof body?.releaseNotes === 'string' ? body.releaseNotes : '';

    if (!platform) {
      return NextResponse.json({ error: 'platform is required' }, { status: 400 });
    }

    if (!version) {
      return NextResponse.json({ error: 'version is required' }, { status: 400 });
    }

    const existing = await prisma.release.findUnique({
      where: { platform_version: { platform, version } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    }

    await prisma.release.update({
      where: { platform_version: { platform, version } },
      data: { releaseNotes },
    });

    // Also update the filesystem notes file if it exists under the standard archive path
    try {
      const downloadsDir =
        process.env.DEEPTERM_DOWNLOADS_DIR || path.join(process.cwd(), 'public', 'downloads');
      const releasesDir = path.join(downloadsDir, 'releases');
      const versionSlug = safeVersionSlug(version);
      const notesPath = path.join(releasesDir, platform, versionSlug, 'release_notes.txt');
      await fs.mkdir(path.dirname(notesPath), { recursive: true });
      await fs.writeFile(notesPath, releaseNotes || '', 'utf-8');
    } catch {
      // ignore
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update release notes:', error);
    return NextResponse.json({ error: 'Failed to update release notes' }, { status: 500 });
  }
}
