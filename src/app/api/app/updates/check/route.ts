import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlatformKey = 'macos' | 'windows' | 'linux' | 'ios';

function normalizePlatform(input: string | null): PlatformKey {
  const v = (input || 'macos').trim().toLowerCase();
  if (v === 'macos' || v === 'mac' || v === 'osx') return 'macos';
  if (v === 'windows' || v === 'win') return 'windows';
  if (v === 'linux') return 'linux';
  if (v === 'ios') return 'ios';
  return 'macos';
}

function parseVersionParts(version: string): number[] {
  return version
    .trim()
    .split('.')
    .map((p) => {
      const n = Number.parseInt(p, 10);
      return Number.isFinite(n) ? n : 0;
    });
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersionParts(latest);
  const currentParts = parseVersionParts(current);
  const len = Math.max(latestParts.length, currentParts.length);

  for (let i = 0; i < len; i++) {
    const l = latestParts[i] || 0;
    const c = currentParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const currentVersion = (searchParams.get('currentVersion') || '').trim();
    if (!currentVersion) {
      return NextResponse.json(
        { error: 'Missing required parameter: currentVersion' },
        { status: 400 }
      );
    }

    const platform = normalizePlatform(searchParams.get('platform'));

    const latest = await prisma.release.findFirst({
      where: { platform },
      orderBy: { publishedAt: 'desc' },
      select: {
        platform: true,
        version: true,
        releaseNotes: true,
        sha256: true,
        minimumOSVersion: true,
        mandatory: true,
        sizeBytes: true,
        publishedAt: true,
        filePath: true,
      },
    });

    if (!latest?.version) {
      return NextResponse.json({
        updateAvailable: false,
        latestVersion: currentVersion,
        currentVersion,
      });
    }

    const updateAvailable = isNewerVersion(latest.version, currentVersion);

    if (!updateAvailable) {
      return NextResponse.json({
        updateAvailable: false,
        latestVersion: latest.version,
        currentVersion,
      });
    }

    const siteUrlSetting = await prisma.systemSettings.findUnique({ where: { key: 'siteUrl' } });
    const siteUrl = (siteUrlSetting?.value || 'https://deepterm.net').replace(/\/$/, '');

    const cacheBust = `v=${encodeURIComponent(latest.version)}`;
    const downloadPath =
      platform === 'macos'
        ? `/downloads/DeepTerm.dmg?${cacheBust}`
        : latest.filePath
          ? `${latest.filePath}?${cacheBust}`
          : '';

    const downloadURL = downloadPath ? `${siteUrl}${downloadPath}` : siteUrl;

    return NextResponse.json({
      updateAvailable: true,
      latestVersion: latest.version,
      currentVersion,
      downloadURL,
      releaseNotes: latest.releaseNotes || '',
      releaseDate: latest.publishedAt.toISOString(),
      minimumOSVersion: latest.minimumOSVersion || '14.0',
      fileSize: latest.sizeBytes ?? 0,
      sha256: latest.sha256 || '',
      mandatory: Boolean(latest.mandatory),
    });
  } catch (error) {
    console.error('Failed to check updates:', error);
    return NextResponse.json({ error: 'Failed to check updates' }, { status: 500 });
  }
}
