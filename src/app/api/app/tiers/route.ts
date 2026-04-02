import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getLimitsForPlan, getFeaturesForPlan } from '@/lib/plan-limits';
import { PLANS, PRICING, monthlyPriceCents, yearlyPriceCents } from '@/lib/pricing';

const APP_API_KEY = process.env.APP_API_KEY || '';

/**
 * GET /api/app/tiers
 * Return the full catalogue of subscription tiers with features, limits, and live pricing.
 * Auth: x-api-key header (required)
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== APP_API_KEY) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    // Fetch live prices from the database (admin-configurable)
    const offerings = await prisma.subscriptionOffering.findMany({
      where: { stage: 'live', isActive: true },
      select: {
        key: true,
        interval: true,
        priceCents: true,
        currency: true,
        stripePriceId: true,
      },
    });

    // Index by "key::interval" for O(1) lookup
    const offeringMap: Record<string, {
      priceCents: number;
      currency: string;
      stripePriceId: string | null;
    }> = {};
    for (const o of offerings) {
      offeringMap[`${o.key}::${o.interval}`] = {
        priceCents: o.priceCents,
        currency: o.currency,
        stripePriceId: o.stripePriceId,
      };
    }

    const tiers = PLANS.map((plan) => {
      const key = plan.key;
      const isStarter = key === 'starter';
      const limits = getLimitsForPlan(key);
      const features = getFeaturesForPlan(key);

      const monthlyOffering = offeringMap[`${key}::monthly`];
      const yearlyOffering = offeringMap[`${key}::yearly`];

      return {
        key,
        name: plan.name,
        description: plan.tagline,
        highlights: plan.highlights,
        features,
        limits: {
          maxHosts: limits.maxHosts,
          maxKeys: limits.maxKeys,
          maxIdentities: limits.maxIdentities,
          maxVaults: limits.maxVaults,
          maxDevices: limits.maxDevices,
        },
        pricing: {
          monthly: monthlyOffering
            ? {
                priceCents: monthlyOffering.priceCents,
                currency: monthlyOffering.currency,
                stripePriceId: monthlyOffering.stripePriceId,
              }
            : isStarter
            ? { priceCents: 0, currency: 'usd', stripePriceId: null }
            : { priceCents: monthlyPriceCents(key), currency: 'usd', stripePriceId: null },
          yearly: yearlyOffering
            ? {
                priceCents: yearlyOffering.priceCents,
                currency: yearlyOffering.currency,
                stripePriceId: yearlyOffering.stripePriceId,
              }
            : isStarter
            ? { priceCents: 0, currency: 'usd', stripePriceId: null }
            : { priceCents: yearlyPriceCents(key), currency: 'usd', stripePriceId: null },
        },
      };
    });

    return NextResponse.json({ tiers });
  } catch (error) {
    console.error('Failed to fetch tiers:', error);
    return NextResponse.json({ error: 'Failed to fetch tiers' }, { status: 500 });
  }
}
