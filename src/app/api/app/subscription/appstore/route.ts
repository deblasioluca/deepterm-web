import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthFromRequest } from '@/lib/zk/middleware';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_API_KEY = process.env.APP_API_KEY || '';

export async function POST(request: NextRequest) {
  try {
    // API key check
    const apiKey = request.headers.get('x-api-key');
    if (apiKey !== APP_API_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    const body = await request.json();
    const { email, hasActiveSubscription, source, originalTransactionId } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 });
    }

    // Resolve user via ZK auth or email
    let user: { id: string; email: string; stripeSubscriptionId: string | null } | null = null;

    const zkAuth = getAuthFromRequest(request);
    if (zkAuth) {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: zkAuth.userId },
        select: { webUserId: true, email: true },
      });

      if (zkUser?.webUserId) {
        user = await prisma.user.findUnique({
          where: { id: zkUser.webUserId },
          select: { id: true, email: true, stripeSubscriptionId: true },
        });
      }
      if (!user && zkUser) {
        user = await prisma.user.findUnique({
          where: { email: zkUser.email },
          select: { id: true, email: true, stripeSubscriptionId: true },
        });
      }
    }

    if (!user) {
      user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, stripeSubscriptionId: true },
      });
    }

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (source === 'appstore') {
      if (hasActiveSubscription) {
        // App Store subscription active — upgrade to Pro
        // Don't overwrite subscriptionSource if user already has active Stripe
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: 'pro',
            subscriptionSource: user.stripeSubscriptionId ? 'stripe' : 'appstore',
            appStoreOriginalTransactionId: originalTransactionId || undefined,
          },
        });

        console.log(`App Store: ${user.email} subscription active -> Pro`);
      } else {
        // App Store subscription not active
        // Only downgrade if they don't have an active Stripe subscription
        if (!user.stripeSubscriptionId) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'free',
              subscriptionSource: 'none',
            },
          });

          console.log(`App Store: ${user.email} subscription inactive -> Free`);
        } else {
          console.log(`App Store: ${user.email} no App Store sub, but has Stripe — keeping Pro`);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('App Store sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
