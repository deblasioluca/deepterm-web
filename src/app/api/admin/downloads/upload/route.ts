import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { sendVersionReleaseEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOWNLOADS_DIR =
  process.env.DEEPTERM_DOWNLOADS_DIR || path.join(process.cwd(), 'public', 'downloads');
const MACOS_LATEST_FILENAME = 'DeepTerm.dmg';
const MACOS_LATEST_PATH = path.join(DOWNLOADS_DIR, MACOS_LATEST_FILENAME);
const VERSION_FILE = path.join(DOWNLOADS_DIR, 'version.json');
const RELEASES_DIR = path.join(DOWNLOADS_DIR, 'releases');
const RELEASE_NOTES_FILENAME = 'release_notes.txt';

type PlatformKey = 'macos' | 'windows' | 'linux' | 'ios';

function normalizePlatform(input: string): PlatformKey | null {
  const v = input.trim().toLowerCase();
  if (v === 'macos' || v === 'mac' || v === 'osx') return 'macos';
  if (v === 'windows' || v === 'win') return 'windows';
  if (v === 'linux') return 'linux';
  if (v === 'ios') return 'ios';
  return null;
}

function platformLatestDir(platform: PlatformKey): string {
  // Keep backwards compatibility: macOS latest stays in /downloads/DeepTerm.dmg
  if (platform === 'macos') return DOWNLOADS_DIR;
  return path.join(DOWNLOADS_DIR, platform);
}

function platformLatestFilename(platform: PlatformKey, uploadedName: string): string {
  const ext = path.extname(uploadedName) || '';
  if (platform === 'macos') return MACOS_LATEST_FILENAME;
  return `DeepTerm${ext}`;
}

type VersionFile = {
  macOS?: string;
  Windows?: string;
  Linux?: string;
  iOS?: string;
  version?: string;
  filename?: string;
  sizeBytes?: number;
  sizeMB?: string;
  uploadedAt?: string;
  uploadedBy?: string;
};

function formatSizeMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function validateAdminSession(): { id: string; email: string; role: string } | null {
  const cookieStore = cookies();
  const sessionCookie = cookieStore.get('admin-session')?.value;

  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf-8'));

    if (!sessionData?.id || !sessionData?.email || !sessionData?.role) {
      return null;
    }

    if (sessionData.exp && sessionData.exp < Date.now()) {
      return null;
    }

    return {
      id: sessionData.id,
      email: sessionData.email,
      role: sessionData.role,
    };
  } catch {
    return null;
  }
}

function safeVersionSlug(version: string): string {
  const trimmed = version.trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function extractVersionFromReleaseNotes(notes: string): string | null {
  const text = notes || '';
  // Example: "## Version 1.0.1 — February 16, 2026"
  const match = text.match(/^##\s*Version\s+v?([0-9][0-9A-Za-z.+-]*)\b/m);
  return match?.[1]?.trim() || null;
}

async function readVersionFile(): Promise<VersionFile> {
  try {
    const current = await fs.readFile(VERSION_FILE, 'utf-8');
    return JSON.parse(current) as VersionFile;
  } catch {
    return {};
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminSession = validateAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const fileEntry = formData.get('file');
    const platformRaw = (formData.get('platform')?.toString() || 'macos').trim();
    const platform = normalizePlatform(platformRaw);
    const version = (formData.get('version')?.toString() || '').trim();
    const releaseNotesText = (formData.get('releaseNotes')?.toString() || '').trim();
    const minimumOSVersionRaw = (formData.get('minimumOSVersion')?.toString() || '').trim();
    const mandatoryRaw = (formData.get('mandatory')?.toString() || '').trim().toLowerCase();
    const releaseNotesFile = formData.get('releaseNotesFile');

    const minimumOSVersion = minimumOSVersionRaw || '14.0';
    const mandatory = mandatoryRaw === 'true' || mandatoryRaw === '1' || mandatoryRaw === 'yes';

    let releaseNotes = releaseNotesText;

    if (releaseNotesFile instanceof File && releaseNotesFile.size > 0) {
      const buf = Buffer.from(await releaseNotesFile.arrayBuffer());
      // Prefer file content if provided
      releaseNotes = buf.toString('utf-8').trim();
    }

    if (!platform) {
      return NextResponse.json(
        { error: 'Invalid platform. Use macos, windows, linux, or ios.' },
        { status: 400 }
      );
    }

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: 'Missing file. Use multipart field name "file".' },
        { status: 400 }
      );
    }

    // Minimal validation per platform
    const lowerName = fileEntry.name.toLowerCase();
    if (platform === 'macos' && !lowerName.endsWith('.dmg')) {
      return NextResponse.json({ error: 'macos upload must be a .dmg' }, { status: 400 });
    }

    if (fileEntry.size === 0) {
      return NextResponse.json({ error: 'Uploaded file is empty.' }, { status: 400 });
    }

    await fs.mkdir(DOWNLOADS_DIR, { recursive: true });
    await fs.mkdir(RELEASES_DIR, { recursive: true });

    // Ensure platform latest directory exists
    const latestDir = platformLatestDir(platform);
    await fs.mkdir(latestDir, { recursive: true });

    const latestFilename = platformLatestFilename(platform, fileEntry.name);
    const latestPath = path.join(latestDir, latestFilename);

    // Capture the currently published version and compute the incoming version
    const existingVersionData = await readVersionFile();

    // Previous version per platform from DB
    const previousRelease = await prisma.release.findFirst({
      where: { platform },
      orderBy: { publishedAt: 'desc' },
      select: { version: true },
    });
    const previousVersion = (previousRelease?.version || '').trim();

    const parsedVersion = extractVersionFromReleaseNotes(releaseNotes);
    const resolvedVersion = version || parsedVersion || previousVersion || existingVersionData.version || '';

    if (!resolvedVersion) {
      return NextResponse.json(
        {
          error:
            'Missing version. Provide multipart field "version" or include a heading like "## Version 1.0.1 — ..." in release_notes.txt.',
        },
        { status: 400 }
      );
    }

    // If there was a previous version, archive its latest binary BEFORE overwriting (best-effort)
    if (previousVersion && previousVersion !== resolvedVersion) {
      try {
        const prevSlug = safeVersionSlug(previousVersion);
        const prevDir = path.join(RELEASES_DIR, platform, prevSlug);
        await fs.mkdir(prevDir, { recursive: true });

        const prevExt = path.extname(latestFilename) || '';
        const prevFileName = `DeepTerm-${platform}-${prevSlug}${prevExt}`;
        const prevFilePath = path.join(prevDir, prevFileName);

        try {
          await fs.access(latestPath);
          try {
            await fs.access(prevFilePath);
            // archive already exists
          } catch {
            await fs.rename(latestPath, prevFilePath);
          }
        } catch {
          // no canonical DMG to archive
        }
      } catch {
        // ignore archive failures
      }
    }

    const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
    const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    await fs.writeFile(latestPath, fileBuffer);
    const uploadedAt = new Date().toISOString();

    const updatedVersionData: VersionFile = {
      ...existingVersionData,
      version: resolvedVersion,
      filename: latestFilename,
      sizeBytes: fileEntry.size,
      sizeMB: formatSizeMB(fileEntry.size),
      uploadedAt,
      uploadedBy: adminSession.email,
    };

    if (platform === 'macos') updatedVersionData.macOS = resolvedVersion;
    if (platform === 'windows') updatedVersionData.Windows = resolvedVersion;
    if (platform === 'linux') updatedVersionData.Linux = resolvedVersion;
    if (platform === 'ios') updatedVersionData.iOS = resolvedVersion;

    await fs.writeFile(VERSION_FILE, JSON.stringify(updatedVersionData, null, 2), 'utf-8');

    // Store a versioned copy and release notes alongside it
    const versionSlug = safeVersionSlug(resolvedVersion);
    const versionDir = path.join(RELEASES_DIR, platform, versionSlug);
    await fs.mkdir(versionDir, { recursive: true });
    const ext = path.extname(latestFilename) || '';
    const versionedFileName = `DeepTerm-${platform}-${versionSlug}${ext}`;
    const versionedFilePath = path.join(versionDir, versionedFileName);

    await fs.copyFile(latestPath, versionedFilePath);

    const notesPath = path.join(versionDir, RELEASE_NOTES_FILENAME);
    if (releaseNotes) {
      await fs.writeFile(notesPath, releaseNotes, 'utf-8');
    } else {
      // Ensure a placeholder file exists to keep structure consistent
      try {
        await fs.access(notesPath);
      } catch {
        await fs.writeFile(notesPath, '', 'utf-8');
      }
    }

    await prisma.release.upsert({
      where: { platform_version: { platform, version: resolvedVersion } },
      update: {
        releaseNotes: releaseNotes || '',
        sha256,
        minimumOSVersion,
        mandatory,
        fileFilename: versionedFileName,
        filePath: `/downloads/releases/${platform}/${versionSlug}/${versionedFileName}`,
        sizeBytes: fileEntry.size,
        publishedAt: new Date(uploadedAt),
        createdBy: adminSession.email,
      },
      create: {
        platform,
        version: resolvedVersion,
        releaseNotes: releaseNotes || '',
        sha256,
        minimumOSVersion,
        mandatory,
        fileFilename: versionedFileName,
        filePath: `/downloads/releases/${platform}/${versionSlug}/${versionedFileName}`,
        sizeBytes: fileEntry.size,
        publishedAt: new Date(uploadedAt),
        createdBy: adminSession.email,
      },
    });

    await prisma.systemSettings.upsert({
      where: { key: 'latestReleaseVersion' },
      update: { value: resolvedVersion },
      create: { key: 'latestReleaseVersion', value: resolvedVersion },
    });

    const [notifySetting, siteUrlSetting] = await Promise.all([
      prisma.systemSettings.findUnique({ where: { key: 'notifyUsersOnNewVersion' } }),
      prisma.systemSettings.findUnique({ where: { key: 'siteUrl' } }),
    ]);

    const shouldNotifyUsers = notifySetting?.value === 'true';
    const siteUrl = (siteUrlSetting?.value || 'https://deepterm.net').replace(/\/$/, '');

    let notifiedUsersCount = 0;
    let totalUsersCount = 0;

    if (shouldNotifyUsers) {
      const users = await prisma.user.findMany({
        select: { name: true, email: true },
      });

      totalUsersCount = users.length;

      const emailResults = await Promise.allSettled(
        users.map((user) =>
          sendVersionReleaseEmail(
            {
              name: user.name,
              email: user.email,
            },
            {
              version: resolvedVersion,
              downloadUrl: `${siteUrl}/downloads/releases/${platform}/${versionSlug}/${versionedFileName}`,
              siteUrl,
              releaseNotes: releaseNotes || undefined,
            }
          )
        )
      );

      notifiedUsersCount = emailResults.filter(
        (result) => result.status === 'fulfilled' && result.value.ok
      ).length;
    }

    return NextResponse.json({
      success: true,
      message: 'Release uploaded successfully.',
      platform,
      downloadPath:
        platform === 'macos'
          ? `/downloads/${MACOS_LATEST_FILENAME}`
          : `/downloads/${platform}/${latestFilename}`,
      versionedDownloadPath: `/downloads/releases/${platform}/${versionSlug}/${versionedFileName}`,
      version: resolvedVersion,
      releaseNotesStored: Boolean(releaseNotes),
      sizeBytes: fileEntry.size,
      fileSize: fileEntry.size,
      sha256,
      minimumOSVersion,
      mandatory,
      uploadedAt,
      uploadedBy: adminSession.email,
      notificationsEnabled: shouldNotifyUsers,
      notifiedUsersCount,
      totalUsersCount,
    });
  } catch (error) {
    console.error('Admin release upload failed:', error);

    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Unknown error';

    const hint =
      /no such column|sqlite.*no such column/i.test(message)
        ? 'Database schema may be out of sync. Run `npx prisma db push` on the server and restart the app.'
        : undefined;

    return NextResponse.json(
      {
        error: 'Failed to upload release.',
        details: { message },
        hint,
      },
      { status: 500 }
    );
  }
}
