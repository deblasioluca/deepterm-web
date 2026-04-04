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
  activeSecretKey,
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

    // Auto-seed DB key sets from .env if none exist yet
    // This ensures the toggle buttons appear without manual "Add" steps
    const existingKeySets = await prisma.stripeKeySet.count();
    if (existingKeySets === 0) {
      const envTestSk = process.env.STRIPE_SECRET_KEY;
      const envTestPk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
      const envLiveSk = process.env.STRIPE_LIVE_SECRET_KEY;
      const envLivePk = process.env.STRIPE_LIVE_PUBLISHABLE_KEY;

      // Seed sandbox key set from STRIPE_SECRET_KEY (sk_test_...)
      if (envTestSk?.startsWith('sk_test_') && envTestPk?.startsWith('pk_test_')) {
        await prisma.stripeKeySet.create({
          data: {
            mode: 'sandbox',
            secretKey: envTestSk,
            publishableKey: envTestPk,
            webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || null,
            priceIds: JSON.stringify({
              proMonthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
              proYearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || '',
              teamMonthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || '',
              teamYearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || '',
              businessMonthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || '',
              businessYearly: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || '',
            }),
            isActive: true,
          },
        });
      }

      // Seed production key set from STRIPE_LIVE_SECRET_KEY (sk_live_...)
      if (envLiveSk?.startsWith('sk_live_') && envLivePk?.startsWith('pk_live_')) {
        await prisma.stripeKeySet.create({
          data: {
            mode: 'production',
            secretKey: envLiveSk,
            publishableKey: envLivePk,
            webhookSecret: process.env.STRIPE_LIVE_WEBHOOK_SECRET || null,
            priceIds: JSON.stringify({
              proMonthly: process.env.STRIPE_LIVE_PRO_MONTHLY_PRICE_ID || '',
              proYearly: process.env.STRIPE_LIVE_PRO_YEARLY_PRICE_ID || '',
              teamMonthly: process.env.STRIPE_LIVE_TEAM_MONTHLY_PRICE_ID || '',
              teamYearly: process.env.STRIPE_LIVE_TEAM_YEARLY_PRICE_ID || '',
              businessMonthly: process.env.STRIPE_LIVE_BUSINESS_MONTHLY_PRICE_ID || '',
              businessYearly: process.env.STRIPE_LIVE_BUSINESS_YEARLY_PRICE_ID || '',
            }),
            isActive: false,
          },
        });
      }

      // Reload after seeding
      await loadActiveKeySet();
    }

    const sandbox = isStripeSandbox();
    const secretKey = activeSecretKey();
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

      const expectedSkPrefix = body.mode === 'sandbox' ? 'sk_test_' : 'sk_live_';
      if (!body.secretKey.startsWith(expectedSkPrefix)) {
        return NextResponse.json(
          { error: `Secret key must start with "${expectedSkPrefix}" for ${body.mode} mode` },
          { status: 400 },
        );
      }

      const expectedPkPrefix = body.mode === 'sandbox' ? 'pk_test_' : 'pk_live_';
      if (!body.publishableKey.startsWith(expectedPkPrefix)) {
        return NextResponse.json(
          { error: `Publishable key must start with "${expectedPkPrefix}" for ${body.mode} mode` },
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
