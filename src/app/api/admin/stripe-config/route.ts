/**
 * GET /api/admin/stripe-config — return Stripe environment info (sandbox vs prod)
 *
 * This is a read-only endpoint. Switching between sandbox and production
 * requires changing the STRIPE_SECRET_KEY env var and restarting the server.
 */

import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { isStripeSandbox, stripeDashboardUrl, PRICE_IDS, PLAN_DETAILS } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sandbox = isStripeSandbox();
  const keyPrefix = (process.env.STRIPE_SECRET_KEY || '').slice(0, 8) + '...';
  const publishablePrefix = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '').slice(0, 8) + '...';

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

  // Price IDs (masked — only show if placeholder or real)
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

  return NextResponse.json({
    sandbox,
    mode: sandbox ? 'test' : 'live',
    dashboardUrl: stripeDashboardUrl(),
    keyPrefix,
    publishablePrefix,
    envStatus,
    priceIds,
    plans: Object.entries(PLAN_DETAILS).map(([key, detail]) => ({
      key,
      name: detail.name,
      price: detail.price,
      monthlyPrice: 'monthlyPrice' in detail ? detail.monthlyPrice : null,
    })),
  });
}
