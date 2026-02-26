import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

// Notify Node-RED -> WhatsApp about payment events (fire-and-forget)
function notifyPayment(event: string, email: string, plan: string, amount?: number, details?: string) {
  fetch(`${NODE_RED_URL}/deepterm/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, email, plan, amount, details }),
  }).catch((err) => {
    console.error('Failed to notify Node-RED (payment):', err);
  });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = getStripe();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Stripe webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const email = session.customer_email || session.metadata?.email;

        if (email) {
          // Get subscription details for expiry date
          let subscriptionExpiresAt: Date | null = null;
          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription as string) as unknown as { current_period_end: number };
              subscriptionExpiresAt = new Date(sub.current_period_end * 1000);
            } catch {
              // Non-critical — expiry will be null
            }
          }

          await prisma.user.update({
            where: { email },
            data: {
              plan: 'pro',
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              subscriptionSource: 'stripe',
              subscriptionExpiresAt,
            },
          });

          await prisma.paymentEvent.create({
            data: {
              email,
              event: 'payment-success',
              plan: 'pro',
              amount: session.amount_total ?? undefined,
              details: 'New Pro subscription',
            },
          });

          console.log(`Stripe: ${email} upgraded to Pro`);

          notifyPayment(
            'payment-success',
            email,
            'pro',
            session.amount_total ?? undefined,
            'New Pro subscription',
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const user = await prisma.user.findFirst({
          where: { stripeCustomerId: customerId },
        });

        if (user) {
          // Only downgrade if they don't have an active App Store subscription
          const hasAppStore = !!user.appStoreOriginalTransactionId;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: hasAppStore ? 'pro' : 'free',
              stripeSubscriptionId: null,
              subscriptionSource: hasAppStore ? 'appstore' : 'none',
              subscriptionExpiresAt: hasAppStore ? undefined : null,
            },
          });

          await prisma.paymentEvent.create({
            data: {
              email: user.email,
              event: 'subscription-cancelled',
              plan: hasAppStore ? 'pro' : 'free',
              details: hasAppStore
                ? 'Stripe cancelled — keeping Pro via App Store'
                : 'Subscription cancelled — downgraded to Free',
            },
          });

          console.log(`Stripe: ${user.email} ${hasAppStore ? 'Stripe cancelled, keeping Pro via App Store' : 'downgraded to Free'}`);

          notifyPayment(
            'subscription-cancelled',
            user.email,
            'free',
            undefined,
            'Subscription cancelled — downgraded to Free',
          );
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const email = invoice.customer_email;

        if (email) {
          await prisma.paymentEvent.create({
            data: {
              email,
              event: 'payment-failed',
              plan: 'unknown',
              amount: invoice.amount_due ?? undefined,
              details: `Payment failed — attempt ${invoice.attempt_count}`,
            },
          });

          console.log(`Stripe: Payment failed for ${email}`);

          notifyPayment(
            'payment-failed',
            email,
            'unknown',
            invoice.amount_due ?? undefined,
            `Payment failed — attempt ${invoice.attempt_count}`,
          );
        }
        break;
      }

      default:
        console.log(`Stripe webhook: unhandled event type ${event.type}`);
    }
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
