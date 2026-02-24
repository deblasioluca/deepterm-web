import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface DownloadInfo {
  version: string;
  size: string;
  lastModified: string;
  exists: boolean;
  downloadUrl?: string;
}

// Version file path - create a version.json next to the DMG
const DOWNLOADS_DIR =
  process.env.DEEPTERM_DOWNLOADS_DIR || path.join(process.cwd(), 'public', 'downloads');
const VERSION_FILE = path.join(DOWNLOADS_DIR, 'version.json');

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export async function GET() {
  try {
    const result: Record<string, DownloadInfo> = {};

    const platforms: Array<{ key: 'macos' | 'windows' | 'linux' | 'ios'; label: string }> = [
      { key: 'macos', label: 'macOS' },
      { key: 'windows', label: 'Windows' },
      { key: 'linux', label: 'Linux' },
      { key: 'ios', label: 'iOS' },
    ];

    const latestReleases = await Promise.all(
      platforms.map(async (p) => {
        const rel = await prisma.release.findFirst({
          where: { platform: p.key },
          orderBy: { publishedAt: 'desc' },
          select: { version: true, filePath: true },
        });
        return { platform: p, rel };
      })
    );

    for (const { platform, rel } of latestReleases) {
      if (rel?.filePath) {
        const relPath = rel.filePath.replace(/^\/+/, '');
        const diskPath = path.join(process.cwd(), 'public', relPath);
        if (fs.existsSync(diskPath)) {
          const stats = fs.statSync(diskPath);
          result[platform.label] = {
            version: rel.version,
            size: formatFileSize(stats.size),
            lastModified: stats.mtime.toISOString(),
            exists: true,
            downloadUrl: rel.filePath,
          };
          continue;
        }
      }

      // Fallback for macOS legacy file
      if (platform.key === 'macos') {
        const dmgPath = path.join(DOWNLOADS_DIR, 'DeepTerm.dmg');
        if (fs.existsSync(dmgPath)) {
          const stats = fs.statSync(dmgPath);
          let version = 'Unknown';
          if (fs.existsSync(VERSION_FILE)) {
            try {
              const versionData = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
              version = versionData.macOS || versionData.version || 'Unknown';
            } catch {
              // ignore
            }
          }
          result[platform.label] = {
            version,
            size: formatFileSize(stats.size),
            lastModified: stats.mtime.toISOString(),
            exists: true,
            downloadUrl: '/downloads/DeepTerm.dmg',
          };
          continue;
        }
      }

      result[platform.label] = {
        version: '-',
        size: '-',
        lastModified: '',
        exists: false,
      };
    }

    // Keep existing placeholders for future
    for (const platform of ['Android', 'Web']) {
      result[platform] = { version: '-', size: '-', lastModified: '', exists: false };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error reading download info:', error);
    return NextResponse.json(
      { error: 'Failed to read download information' },
      { status: 500 }
    );
  }
}
