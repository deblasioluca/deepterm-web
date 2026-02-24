import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stripe = getStripe();

    const draft = await prisma.subscriptionOffering.findMany({
      where: { stage: 'draft' },
      orderBy: [{ key: 'asc' }, { interval: 'asc' }],
    });

    if (draft.length === 0) {
      return NextResponse.json({ error: 'No draft offerings to deploy' }, { status: 400 });
    }

    // Build map of product IDs per plan key from existing live offerings
    const existingLive = await prisma.subscriptionOffering.findMany({
      where: { stage: 'live' },
      select: { key: true, stripeProductId: true, stripePriceId: true, interval: true },
    });

    const productIdByKey = new Map<string, string>();
    for (const o of existingLive) {
      if (o.stripeProductId) productIdByKey.set(o.key, o.stripeProductId);
    }

    const deployed: Array<{ key: string; interval: string; stripePriceId: string }> = [];

    for (const o of draft) {
      // Ensure a Stripe product exists per key
      let productId = productIdByKey.get(o.key);
      if (!productId) {
        const product = await stripe.products.create({
          name: o.name,
          metadata: { key: o.key },
        });
        productId = product.id;
        productIdByKey.set(o.key, productId);
      }

      // Create a new Stripe price (Stripe prices are immutable for amount/interval)
      const price = await stripe.prices.create({
        product: productId,
        currency: o.currency || 'usd',
        unit_amount: o.priceCents,
        recurring: { interval: o.interval === 'yearly' ? 'year' : 'month' },
        metadata: { key: o.key, stage: 'live' },
      });

      // Deactivate previous live price for the same key+interval (best-effort)
      const prev = existingLive.find((x) => x.key === o.key && x.interval === o.interval && x.stripePriceId);
      if (prev?.stripePriceId) {
        try {
          await stripe.prices.update(prev.stripePriceId, { active: false });
        } catch {
          // ignore
        }
      }

      await prisma.subscriptionOffering.upsert({
        where: { key_interval_stage: { key: o.key, interval: o.interval, stage: 'live' } },
        update: {
          name: o.name,
          description: o.description,
          priceCents: o.priceCents,
          currency: o.currency,
          isActive: o.isActive,
          stripeProductId: productId,
          stripePriceId: price.id,
        },
        create: {
          key: o.key,
          interval: o.interval,
          stage: 'live',
          name: o.name,
          description: o.description,
          priceCents: o.priceCents,
          currency: o.currency,
          isActive: o.isActive,
          stripeProductId: productId,
          stripePriceId: price.id,
        },
      });

      deployed.push({ key: o.key, interval: o.interval, stripePriceId: price.id });
    }

    // Any live offerings not present in draft become inactive
    const keep = new Set(draft.map((o) => `${o.key}::${o.interval}`));
    const toDeactivate = await prisma.subscriptionOffering.findMany({
      where: { stage: 'live' },
      select: { key: true, interval: true },
    });

    const deactivateTargets = toDeactivate.filter((o) => !keep.has(`${o.key}::${o.interval}`));
    if (deactivateTargets.length > 0) {
      await prisma.subscriptionOffering.updateMany({
        where: {
          stage: 'live',
          OR: deactivateTargets.map((o) => ({ key: o.key, interval: o.interval })),
        },
        data: { isActive: false },
      });
    }

    await prisma.auditLog.create({
      data: {
        adminId: session.id,
        action: 'subscription-offerings.deployed',
        entityType: 'subscription-offering',
        entityId: 'all',
        metadata: JSON.stringify({ deployedCount: deployed.length }),
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, deployed });
  } catch (error) {
    console.error('Failed to deploy offerings:', error);
    return NextResponse.json({ error: 'Failed to deploy offerings' }, { status: 500 });
  }
}
