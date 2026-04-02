/**
 * GET  /api/admin/stripe-config — return Stripe environment info + saved key sets
 * POST /api/admin/stripe-config — save or switch Stripe key sets (sandbox/production)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { prisma } from '@/lib/prisma';
import {
  isStripeSandbox,
  stripeDashboardUrl,
  PRICE_IDS,
  PLAN_DETAILS,
  loadActiveKeySet,
  switchStripeMode,
  getPublishableKey,
} from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Valid admin session required' }, { status: 401 });
  }

  try {
    // Ensure DB key set is loaded (first request after restart)
    await loadActiveKeySet();

    const sandbox = isStripeSandbox();
    const secretKey = process.env.STRIPE_SECRET_KEY || '';
    const pubKey = getPublishableKey();
    const keyPrefix = secretKey ? secretKey.slice(0, 8) + '...' : '(none)';
    const publishablePrefix = pubKey ? pubKey.slice(0, 8) + '...' : '(none)';

    // Check which env vars are set
    const envStatus = {
      STRIPE_SECRET_KEY: !!process.env.STRIPE_SECRET_KEY,
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      STRIPE_WEBHOOK_SECRET: !!process.env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRO_MONTHLY_PRICE_ID: !!process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
      STRIPE_PRO_YEARLY_PRICE_ID: !!process.env.STRIPE_PRO_YEARLY_PRICE_ID,
      STRIPE_TEAM_MONTHLY_PRICE_ID: !!process.env.STRIPE_TEAM_MONTHLY_PRICE_ID,
      STRIPE_TEAM_YEARLY_PRICE_ID: !!process.env.STRIPE_TEAM_YEARLY_PRICE_ID,
      STRIPE_BUSINESS_MONTHLY_PRICE_ID: !!process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID,
      STRIPE_BUSINESS_YEARLY_PRICE_ID: !!process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID,
    };

    // Price IDs (masked)
    const priceIds = Object.entries(PRICE_IDS).reduce(
      (acc, [plan, ids]) => {
        if (!ids) {
          acc[plan] = null;
          return acc;
        }
        acc[plan] = {
          monthly: ids.monthly.startsWith('price_') && ids.monthly.length > 20
            ? ids.monthly.slice(0, 12) + '...'
            : ids.monthly + ' (placeholder)',
          yearly: ids.yearly.startsWith('price_') && ids.yearly.length > 20
            ? ids.yearly.slice(0, 12) + '...'
            : ids.yearly + ' (placeholder)',
        };
        return acc;
      },
      {} as Record<string, { monthly: string; yearly: string } | null>,
    );

    // Fetch saved key sets from DB (masked for security)
    const keySets = await prisma.stripeKeySet.findMany({
      orderBy: { mode: 'asc' },
    });
    const maskedKeySets = keySets.map((ks) => ({
      id: ks.id,
      mode: ks.mode,
      isActive: ks.isActive,
      createdAt: ks.createdAt,
      updatedAt: ks.updatedAt,
      secretKeyPrefix: ks.secretKey.slice(0, 8) + '...',
      publishableKeyPrefix: ks.publishableKey.slice(0, 8) + '...',
      hasWebhookSecret: !!ks.webhookSecret,
      hasPriceIds: !!ks.priceIds,
    }));

    return NextResponse.json({
      sandbox,
      mode: sandbox ? 'test' : 'live',
      dashboardUrl: stripeDashboardUrl(),
      keyPrefix,
      publishablePrefix,
      envStatus,
      priceIds,
      keySets: maskedKeySets,
      plans: Object.entries(PLAN_DETAILS)
        .filter(([key]) => key !== 'enterprise')
        .map(([key, detail]) => ({
          key,
          name: detail.name,
          price: detail.price,
          monthlyPrice: 'monthlyPrice' in detail ? detail.monthlyPrice : null,
        })),
    });
  } catch (error) {
    console.error('Failed to fetch Stripe config:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: 'Failed to fetch Stripe config' }, { status: 500 });
  }
}

interface SaveKeySetBody {
  action: 'save' | 'switch' | 'delete';
  mode?: 'sandbox' | 'production';
  secretKey?: string;
  publishableKey?: string;
  webhookSecret?: string;
  priceIds?: {
    proMonthly?: string;
    proYearly?: string;
    teamMonthly?: string;
    teamYearly?: string;
    businessMonthly?: string;
    businessYearly?: string;
  };
}

export async function POST(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as SaveKeySetBody;

    // --- Switch active mode ---
    if (body.action === 'switch') {
      if (!body.mode || !['sandbox', 'production'].includes(body.mode)) {
        return NextResponse.json({ error: 'Invalid mode. Must be "sandbox" or "production".' }, { status: 400 });
      }
      const result = await switchStripeMode(body.mode);
      if (!result) {
        return NextResponse.json(
          { error: `No key set found for mode "${body.mode}". Save one first.` },
          { status: 404 },
        );
      }
      return NextResponse.json({ ok: true, mode: body.mode, sandbox: body.mode === 'sandbox' });
    }

    // --- Delete a key set ---
    if (body.action === 'delete') {
      if (!body.mode) {
        return NextResponse.json({ error: 'mode is required for delete' }, { status: 400 });
      }
      await prisma.stripeKeySet.deleteMany({ where: { mode: body.mode } });
      await loadActiveKeySet();
      return NextResponse.json({ ok: true, deleted: body.mode });
    }

    // --- Save / upsert a key set ---
    if (body.action === 'save') {
      if (!body.mode || !body.secretKey || !body.publishableKey) {
        return NextResponse.json(
          { error: 'mode, secretKey, and publishableKey are required' },
          { status: 400 },
        );
      }

      const expectedPrefix = body.mode === 'sandbox' ? 'sk_test_' : 'sk_live_';
      if (!body.secretKey.startsWith(expectedPrefix)) {
        return NextResponse.json(
          { error: `Secret key must start with "${expectedPrefix}" for ${body.mode} mode` },
          { status: 400 },
        );
      }

      await prisma.stripeKeySet.upsert({
        where: { mode: body.mode },
        create: {
          mode: body.mode,
          secretKey: body.secretKey,
          publishableKey: body.publishableKey,
          webhookSecret: body.webhookSecret || null,
          priceIds: body.priceIds ? JSON.stringify(body.priceIds) : null,
          isActive: false,
        },
        update: {
          secretKey: body.secretKey,
          publishableKey: body.publishableKey,
          webhookSecret: body.webhookSecret || null,
          priceIds: body.priceIds ? JSON.stringify(body.priceIds) : null,
        },
      });

      return NextResponse.json({ ok: true, saved: body.mode });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Stripe config update failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
