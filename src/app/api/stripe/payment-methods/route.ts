import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import Stripe from 'stripe';

/**
 * GET /api/stripe/payment-methods
 * List all payment methods for the user's team
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user?.team) {
      return NextResponse.json({ paymentMethods: [] });
    }

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { teamId: user.team.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      paymentMethods: paymentMethods.map((pm) => ({
        id: pm.id,
        stripeId: pm.stripePaymentMethodId,
        type: pm.type,
        brand: pm.brand,
        last4: pm.last4,
        expMonth: pm.expMonth,
        expYear: pm.expYear,
        email: pm.email,
        walletType: pm.walletType,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get payment methods error:', error);
    return NextResponse.json(
      { error: 'Failed to get payment methods' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/stripe/payment-methods
 * Create a setup intent for adding a new payment method
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body as { action?: string };

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Create team if it doesn't exist
    let team = user.team;
    if (!team) {
      team = await prisma.team.create({
        data: {
          name: `${user.name}'s Team`,
          members: { connect: { id: user.id } },
        },
      });
    }

    // Get or create Stripe customer
    let customerId = team.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { teamId: team.id },
      });
      customerId = customer.id;
      await prisma.team.update({
        where: { id: team.id },
        data: { stripeCustomerId: customer.id },
      });
    }

    if (action === 'create_setup_intent') {
      // Create a SetupIntent for collecting payment method
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ['card'],
        usage: 'off_session',
        metadata: { teamId: team.id },
      });

      return NextResponse.json({
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id,
      });
    }

    // Default: Create a checkout session for adding a payment method
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const setupSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'setup',
      currency: 'usd',
      payment_method_types: ['card', 'paypal', 'link'],
      success_url: `${baseUrl}/dashboard/billing?setup=success`,
      cancel_url: `${baseUrl}/dashboard/billing?setup=canceled`,
      metadata: { teamId: team.id },
    });

    return NextResponse.json({
      url: setupSession.url,
      sessionId: setupSession.id,
    });
  } catch (error) {
    console.error('Create payment method error:', error);
    return NextResponse.json(
      { error: 'Failed to create payment method setup' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/stripe/payment-methods
 * Update payment method (set as default)
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { paymentMethodId, action } = body as {
      paymentMethodId: string;
      action: 'set_default';
    };

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'Payment method ID is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user?.team) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 });
    }

    // Check user permissions
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        teamId: user.team.id,
      },
    });

    if (!paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      );
    }

    if (action === 'set_default') {
      // Update Stripe customer's default payment method
      if (user.team.stripeCustomerId) {
        await stripe.customers.update(user.team.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: paymentMethod.stripePaymentMethodId,
          },
        });
      }

      // Update database: set all to non-default, then set selected as default
      await prisma.$transaction([
        prisma.paymentMethod.updateMany({
          where: { teamId: user.team.id },
          data: { isDefault: false },
        }),
        prisma.paymentMethod.update({
          where: { id: paymentMethodId },
          data: { isDefault: true },
        }),
      ]);

      return NextResponse.json({
        success: true,
        message: 'Default payment method updated',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Update payment method error:', error);
    return NextResponse.json(
      { error: 'Failed to update payment method' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/stripe/payment-methods
 * Remove a payment method
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const paymentMethodId = searchParams.get('id');

    if (!paymentMethodId) {
      return NextResponse.json(
        { error: 'Payment method ID is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user?.team) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 });
    }

    // Check user permissions
    if (!['owner', 'admin'].includes(user.role)) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const paymentMethod = await prisma.paymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        teamId: user.team.id,
      },
    });

    if (!paymentMethod) {
      return NextResponse.json(
        { error: 'Payment method not found' },
        { status: 404 }
      );
    }

    // Detach from Stripe
    try {
      await stripe.paymentMethods.detach(paymentMethod.stripePaymentMethodId);
    } catch (stripeError) {
      console.error('Stripe detach error:', stripeError);
      // Continue with local deletion even if Stripe fails
    }

    // Delete from database
    await prisma.paymentMethod.delete({
      where: { id: paymentMethodId },
    });

    return NextResponse.json({
      success: true,
      message: 'Payment method removed',
    });
  } catch (error) {
    console.error('Delete payment method error:', error);
    return NextResponse.json(
      { error: 'Failed to delete payment method' },
      { status: 500 }
    );
  }
}
