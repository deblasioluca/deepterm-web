import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { sendVersionReleaseEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminEmailFromSession(): string | null {
  const sessionCookie = cookies().get('admin-session')?.value;
  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData = JSON.parse(Buffer.from(sessionCookie, 'base64').toString('utf-8'));
    if (!sessionData?.email || (sessionData.exp && sessionData.exp < Date.now())) {
      return null;
    }

    return sessionData.email as string;
  } catch {
    return null;
  }
}

function isPlausibleEmail(value: string): boolean {
  // Minimal validation to catch obvious mistakes; real validation happens at SMTP.
  return value.includes('@') && !/\s/.test(value);
}

export async function POST(request: NextRequest) {
  try {
    const adminEmail = getAdminEmailFromSession();
    if (!adminEmail) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const toEmailRaw = typeof body?.toEmail === 'string' ? body.toEmail : '';
    const toEmail = toEmailRaw.trim();
    const recipientEmail = toEmail || adminEmail;

    if (toEmail && !isPlausibleEmail(toEmail)) {
      return NextResponse.json(
        { error: 'Invalid recipient email' },
        { status: 400 }
      );
    }

    const [versionSetting, siteUrlSetting] = await Promise.all([
      prisma.systemSettings.findUnique({ where: { key: 'latestReleaseVersion' } }),
      prisma.systemSettings.findUnique({ where: { key: 'siteUrl' } }),
    ]);

    const fallbackVersion = versionSetting?.value || 'latest';
    const siteUrl = (siteUrlSetting?.value || 'https://deepterm.net').replace(/\/$/, '');

    const latestMac = await prisma.release.findFirst({
      where: { platform: 'macos' },
      orderBy: { publishedAt: 'desc' },
      select: { version: true, filePath: true, releaseNotes: true },
    });

    const latestAny = await prisma.release.findFirst({
      orderBy: { publishedAt: 'desc' },
      select: { version: true, filePath: true, releaseNotes: true },
    });

    const selected = latestMac || latestAny;
    const version = selected?.version || fallbackVersion;
    const downloadUrl = selected?.filePath ? `${siteUrl}${selected.filePath}` : `${siteUrl}/downloads/DeepTerm.dmg`;

    const result = await sendVersionReleaseEmail(
      {
        name: 'Admin',
        email: recipientEmail,
      },
      {
        version,
        downloadUrl,
        siteUrl,
        releaseNotes: selected?.releaseNotes || undefined,
      }
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Failed to send test email', details: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test release email sent to ${recipientEmail}`,
    });
  } catch (error) {
    console.error('Failed to send test release email:', error);
    return NextResponse.json({ error: 'Failed to send test release email' }, { status: 500 });
  }
}
