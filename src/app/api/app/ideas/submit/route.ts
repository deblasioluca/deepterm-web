import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { verifyToken, verifyBackupCode } from '@/lib/2fa';
import { getAuthFromRequest } from '@/lib/zk/middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_API_KEY = process.env.APP_API_KEY || process.env.X_API_KEY || 'deepterm-app-secret-key';
const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

const VALID_CATEGORIES = ['feature', 'improvement', 'integration', 'ui', 'other'];

async function notifyNodeRed(payload: Record<string, unknown>) {
  try {
    await fetch(`${NODE_RED_URL}/deepterm/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.error('Node-RED triage notify failed:', e);
  }
}

export async function POST(request: NextRequest) {
  try {
    // ── API key check ──
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== APP_API_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    // ── Parse body ──
    const body = await request.json();
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    const category = VALID_CATEGORIES.includes(body.category) ? body.category : 'feature';

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }
    if (title.length > 200) {
      return NextResponse.json({ error: 'Title too long (max 200 chars)' }, { status: 400 });
    }
    if (description.length > 5000) {
      return NextResponse.json({ error: 'Description too long (max 5000 chars)' }, { status: 400 });
    }

    // ── Authenticate user ──
    let user: {
      id: string;
      email: string;
      passwordHash: string;
      twoFactorEnabled: boolean;
      twoFactorSecret: string | null;
      twoFactorBackupCodes: string | null;
    } | null = null;

    const zkAuth = getAuthFromRequest(request);

    if (zkAuth) {
      // ZK Vault token auth (already logged in via 2FA)
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
          select: { id: true, email: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
        });
      }

      if (!user) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          select: { id: true, email: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
        });
      }

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    } else {
      // Email + password auth
      const email = (body.email || '').trim();
      const password = (body.password || '').trim();
      const twoFactorCode = (body.twoFactorCode || '').trim();

      if (!email) return NextResponse.json({ error: 'Email is required' }, { status: 400 });
      if (!password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });

      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, passwordHash: true, twoFactorEnabled: true, twoFactorSecret: true, twoFactorBackupCodes: true },
      });
      if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return NextResponse.json({ error: 'Invalid password' }, { status: 401 });

      if (user.twoFactorEnabled) {
        if (!twoFactorCode) return NextResponse.json({ error: '2FA_REQUIRED' }, { status: 401 });

        const secret = user.twoFactorSecret || '';
        const isTotpValid = secret ? verifyToken(twoFactorCode, secret) : false;
        if (!isTotpValid) {
          let hashedCodes: string[] | null = null;
          if (user.twoFactorBackupCodes) {
            try { hashedCodes = JSON.parse(user.twoFactorBackupCodes) as string[]; } catch { hashedCodes = null; }
          }
          if (!hashedCodes || !Array.isArray(hashedCodes) || hashedCodes.length === 0) {
            return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          }
          const remaining = verifyBackupCode(twoFactorCode, hashedCodes);
          if (!remaining) return NextResponse.json({ error: 'INVALID_2FA_CODE' }, { status: 401 });
          await prisma.user.update({ where: { id: user.id }, data: { twoFactorBackupCodes: JSON.stringify(remaining) } });
        }
      }
    }

    // ── Create idea ──
    const idea = await prisma.idea.create({
      data: {
        title,
        description,
        category,
        authorId: user.id,
        status: 'consideration',
      },
    });

    // ── Auto-vote for author ──
    await prisma.vote.create({
      data: {
        userId: user.id,
        ideaId: idea.id,
      },
    });

    // ── Notify Node-RED → WhatsApp ──
    await notifyNodeRed({
      event: 'new-idea',
      id: idea.id,
      title: idea.title,
      description: idea.description,
      category,
      source: 'app',
      authorEmail: user.email,
      voteCount: 1,
      url: `https://deepterm.net/admin/feedback`,
    });

    return NextResponse.json({
      success: true,
      message: 'Idea submitted successfully',
      idea: {
        id: idea.id,
        title: idea.title,
        status: 'consideration',
        votes: 1,
      },
    });
  } catch (error) {
    console.error('App idea submit error:', error);
    return NextResponse.json({ error: 'An error occurred while submitting the idea' }, { status: 500 });
  }
}
