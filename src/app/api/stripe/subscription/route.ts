import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  cancelSubscription,
  resumeSubscription,
  updateSubscriptionSeats,
  changeSubscriptionPlan,
  PRICE_IDS,
  PlanType,
} from '@/lib/stripe';

// GET - Get current subscription details
export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        team: {
          include: {
            members: {
              select: { id: true, name: true, email: true, role: true },
            },
            invoices: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
      },
    });

    if (!user?.team) {
      return NextResponse.json({
        subscription: null,
        plan: 'starter',
        seats: 0,
        usedSeats: 0,
      });
    }

    // Get default payment method
    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: { teamId: user.team.id, isDefault: true },
    });

    return NextResponse.json({
      subscription: {
        status: user.team.subscriptionStatus,
        currentPeriodEnd: user.team.currentPeriodEnd,
        currentPeriodStart: user.team.currentPeriodStart,
        cancelAtPeriodEnd: user.team.cancelAtPeriodEnd,
      },
      plan: user.team.plan,
      seats: user.team.seats,
      usedSeats: user.team.members.length,
      members: user.team.members,
      invoices: user.team.invoices,
      paymentMethod: paymentMethod
        ? {
            brand: paymentMethod.brand,
            last4: paymentMethod.last4,
            expMonth: paymentMethod.expMonth,
            expYear: paymentMethod.expYear,
          }
        : null,
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to get subscription' },
      { status: 500 }
    );
  }
}

// PATCH - Update subscription (cancel, resume, change seats/plan)
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { action, seats, plan, billingPeriod } = body as {
      action: 'cancel' | 'resume' | 'update_seats' | 'change_plan';
      seats?: number;
      plan?: PlanType;
      billingPeriod?: 'monthly' | 'yearly';
    };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { 
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!user?.team?.stripeSubscriptionId) {
      return NextResponse.json(
        { error: 'No active subscription' },
        { status: 404 }
      );
    }

    // Check if user is owner/admin
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const subscriptionId = user.team.stripeSubscriptionId;

    switch (action) {
      case 'cancel': {
        await cancelSubscription(subscriptionId, false);
        await prisma.team.update({
          where: { id: user.team.id },
          data: { cancelAtPeriodEnd: true },
        });
        return NextResponse.json({ success: true, message: 'Subscription will be canceled at period end' });
      }

      case 'resume': {
        await resumeSubscription(subscriptionId);
        await prisma.team.update({
          where: { id: user.team.id },
          data: { cancelAtPeriodEnd: false },
        });
        return NextResponse.json({ success: true, message: 'Subscription resumed' });
      }

      case 'update_seats': {
        if (!seats || seats < 1) {
          return NextResponse.json(
            { error: 'Invalid seat count' },
            { status: 400 }
          );
        }
        const minSeats = user.team.members?.length || 1;
        if (seats < minSeats) {
          return NextResponse.json(
            { error: `Cannot reduce seats below current team size (${minSeats})` },
            { status: 400 }
          );
        }
        await updateSubscriptionSeats(subscriptionId, seats);
        await prisma.team.update({
          where: { id: user.team.id },
          data: { seats },
        });
        return NextResponse.json({ success: true, message: 'Seats updated' });
      }

      case 'change_plan': {
        if (!plan || !['pro', 'team', 'business'].includes(plan)) {
          return NextResponse.json(
            { error: 'Invalid plan' },
            { status: 400 }
          );
        }

        const interval = (billingPeriod || 'yearly') as 'monthly' | 'yearly';
        const liveOffering = await prisma.subscriptionOffering.findUnique({
          where: {
            key_interval_stage: {
              key: plan,
              interval,
              stage: 'live',
            },
          },
          select: { stripePriceId: true, isActive: true },
        });

        let priceId = liveOffering?.isActive ? liveOffering?.stripePriceId : null;

        if (!priceId) {
          const priceIds = PRICE_IDS[plan];
          if (!priceIds) {
            return NextResponse.json(
              { error: 'Price not configured for this plan' },
              { status: 400 }
            );
          }
          priceId = priceIds[interval];
        }

        if (!priceId) {
          return NextResponse.json(
            { error: 'Price not configured for this plan' },
            { status: 400 }
          );
        }

        await changeSubscriptionPlan(subscriptionId, priceId);
        await prisma.team.update({
          where: { id: user.team.id },
          data: { plan },
        });
        return NextResponse.json({ success: true, message: 'Plan updated' });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Update subscription error:', error);
    return NextResponse.json(
      { error: 'Failed to update subscription' },
      { status: 500 }
    );
  }
}
