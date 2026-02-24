import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getOrCreateStripeCustomer,
  createCheckoutSession,
  PRICE_IDS,
  PlanType,
} from '@/lib/stripe';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { plan, billingPeriod = 'yearly', seats = 1 } = body as {
      plan: PlanType;
      billingPeriod: 'monthly' | 'yearly';
      seats: number;
    };

    if (!plan || !['pro', 'team'].includes(plan)) {
      return NextResponse.json(
        { error: 'Invalid plan selected' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get or create team
    let team = user.team;
    if (!team) {
      team = await prisma.team.create({
        data: {
          name: `${user.name}'s Team`,
          members: {
            connect: { id: user.id },
          },
        },
      });
    }

    // Get or create Stripe customer
    const customer = await getOrCreateStripeCustomer(
      team.id,
      user.email,
      team.name
    );

    // Prefer live offerings from DB (admin-controlled + deploy)
    const liveOffering = await prisma.subscriptionOffering.findUnique({
      where: {
        key_interval_stage: {
          key: plan,
          interval: billingPeriod,
          stage: 'live',
        },
      },
      select: { stripePriceId: true, isActive: true },
    });

    let priceId = liveOffering?.isActive ? liveOffering?.stripePriceId : null;

    // Fallback to env-configured PRICE_IDS
    if (!priceId) {
      const priceIds = PRICE_IDS[plan];
      if (!priceIds) {
        return NextResponse.json(
          { error: 'Price not configured for this plan' },
          { status: 400 }
        );
      }
      priceId = priceIds[billingPeriod];
    }

    if (!priceId) {
      return NextResponse.json(
        { error: 'Price not configured for this plan' },
        { status: 400 }
      );
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const checkoutSession = await createCheckoutSession(
      customer.id,
      priceId,
      team.id,
      seats,
      `${baseUrl}/dashboard/billing?success=true`,
      `${baseUrl}/dashboard/billing?canceled=true`
    );

    return NextResponse.json({
      url: checkoutSession.url,
      sessionId: checkoutSession.id,
    });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
