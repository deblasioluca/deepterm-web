import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { PLAN_DETAILS, PRICE_IDS } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type OfferingInput = {
  key: string;
  interval: 'monthly' | 'yearly';
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
};

async function ensureDefaults() {
  const existing = await prisma.subscriptionOffering.count();
  if (existing > 0) return;

  const defaults: OfferingInput[] = [
    {
      key: 'pro',
      interval: 'monthly',
      name: PLAN_DETAILS.pro.name,
      description: null,
      priceCents: Math.round((PLAN_DETAILS.pro.monthlyPrice || 0) * 100),
      currency: 'usd',
      isActive: true,
    },
    {
      key: 'pro',
      interval: 'yearly',
      name: PLAN_DETAILS.pro.name,
      description: null,
      priceCents: Math.round((PLAN_DETAILS.pro.price || 0) * 100),
      currency: 'usd',
      isActive: true,
    },
    {
      key: 'team',
      interval: 'monthly',
      name: PLAN_DETAILS.team.name,
      description: null,
      priceCents: Math.round((PLAN_DETAILS.team.monthlyPrice || 0) * 100),
      currency: 'usd',
      isActive: true,
    },
    {
      key: 'team',
      interval: 'yearly',
      name: PLAN_DETAILS.team.name,
      description: null,
      priceCents: Math.round((PLAN_DETAILS.team.price || 0) * 100),
      currency: 'usd',
      isActive: true,
    },
  ];

  for (const stage of ['live', 'draft'] as const) {
    for (const o of defaults) {
      const stripePriceId =
        stage === 'live'
          ? (PRICE_IDS as any)?.[o.key]?.[o.interval] || null
          : null;
      await prisma.subscriptionOffering.create({
        data: {
          ...o,
          stage,
          stripePriceId,
          stripeProductId: null,
        },
      });
    }
  }
}

export async function GET() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureDefaults();

    const [draft, live] = await Promise.all([
      prisma.subscriptionOffering.findMany({
        where: { stage: 'draft' },
        orderBy: [{ key: 'asc' }, { interval: 'asc' }],
      }),
      prisma.subscriptionOffering.findMany({
        where: { stage: 'live' },
        orderBy: [{ key: 'asc' }, { interval: 'asc' }],
      }),
    ]);

    return NextResponse.json({ draft, live });
  } catch (error) {
    console.error('Failed to fetch subscription offerings:', error);
    return NextResponse.json({ error: 'Failed to fetch offerings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const draft = Array.isArray(body?.draft) ? (body.draft as OfferingInput[]) : null;

    if (!draft) {
      return NextResponse.json({ error: 'draft array is required' }, { status: 400 });
    }

    // Upsert all provided draft offerings
    for (const o of draft) {
      if (!o?.key || !o?.interval || !o?.name || typeof o.priceCents !== 'number') {
        continue;
      }
      await prisma.subscriptionOffering.upsert({
        where: { key_interval_stage: { key: o.key, interval: o.interval, stage: 'draft' } },
        update: {
          name: o.name,
          description: o.description || null,
          priceCents: o.priceCents,
          currency: o.currency || 'usd',
          isActive: Boolean(o.isActive),
        },
        create: {
          key: o.key,
          interval: o.interval,
          stage: 'draft',
          name: o.name,
          description: o.description || null,
          priceCents: o.priceCents,
          currency: o.currency || 'usd',
          isActive: Boolean(o.isActive),
        },
      });
    }

    // Remove draft offerings not present in incoming list
    const keepKeys = new Set(draft.map((o) => `${o.key}::${o.interval}`));
    const existingDraft = await prisma.subscriptionOffering.findMany({ where: { stage: 'draft' } });
    const toDelete = existingDraft.filter((o) => !keepKeys.has(`${o.key}::${o.interval}`));
    if (toDelete.length > 0) {
      await prisma.subscriptionOffering.deleteMany({
        where: {
          stage: 'draft',
          OR: toDelete.map((o) => ({ key: o.key, interval: o.interval })),
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to update draft offerings:', error);
    return NextResponse.json({ error: 'Failed to update draft offerings' }, { status: 500 });
  }
}
