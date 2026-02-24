import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { normalizeIssueArea, getIssuesStorageDir } from '@/lib/issues';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { getAuthFromRequest } from '@/lib/zk/middleware';
import { notifyNewIssue } from '@/lib/node-red';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_API_KEY = process.env.APP_API_KEY || process.env.X_API_KEY || 'deepterm-app-secret-key';

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

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== APP_API_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const authHeader = request.headers.get('authorization');
    const zkAuth = getAuthFromRequest(request);
    if (authHeader && authHeader.startsWith('Bearer ') && !zkAuth) {
      return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
    }

    const formData = await request.formData();

    const email = (formData.get('email')?.toString() || '').trim();
    const password = (formData.get('password')?.toString() || '').trim();
    const twoFactorCode = (formData.get('twoFactorCode')?.toString() || '').trim();
    const title = (formData.get('title')?.toString() || '').trim();
    const description = (formData.get('description')?.toString() || '').trim();
    const area = normalizeIssueArea(formData.get('area')?.toString());

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    let user: {
      id: string;
      email: string;
      passwordHash: string;
      twoFactorEnabled: boolean;
      twoFactorSecret: string | null;
      twoFactorBackupCodes: string | null;
    } | null = null;

    // If the app already has a valid ZK Vault access token (obtained via 2FA login),
    // allow issue submission without re-supplying email/password/2FA.
    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'INVALID_ACCESS_TOKEN' }, { status: 401 });
      }

      if (zkUser.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            twoFactorBackupCodes: true,
          },
        });
      }

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          select: {
            id: true,
            email: true,
            passwordHash: true,
            twoFactorEnabled: true,
            twoFactorSecret: true,
            twoFactorBackupCodes: true,
          },
        });
      }

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else {
      if (!email) {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }

      user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          twoFactorEnabled: true,
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
        },
      });
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
      }

      if (user.twoFactorEnabled) {
        if (!twoFactorCode) {
          return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });
        }

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(twoFactorCode, secret) : false;
        if (!isTotpValid) {
          let hashedCodes: string[] | null = null;
          if (user.twoFactorBackupCodes) {
            try {
              hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[];
            } catch {
              hashedCodes = null;
            }
          }

          if (!hashedCodes || !Array.isArray(hashedCodes) || hashedCodes.length === 0) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          const remaining = verifyBackupCode(twoFactorCode, hashedCodes);
          if (!remaining) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }

          await prisma.user.update({
            where: { id: user.id },
            data: { twoFactorBackupCodes: JSON.stringify(remaining) },
          });
        }
      }
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
        userId: user.id,
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
        authorEmail: user.email,
        message: 'Issue submitted.',
        status: 'open',
      },
    });

    // Notify Node-RED → WhatsApp (fire-and-forget)
    notifyNewIssue({
      id: issue.id,
      title,
      description,
      area,
      authorEmail: user.email,
      source: 'app',
    });

    return NextResponse.json({
      success: true,
      message: 'Issue submitted successfully',
      issue: {
        id: issue.id,
        status: 'open',
      },
    });
  } catch (error) {
    console.error('App issue submit error:', error);
    return NextResponse.json({ error: 'An error occurred while submitting the issue' }, { status: 500 });
  }
}
