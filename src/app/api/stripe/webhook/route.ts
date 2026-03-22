import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { notifyPayment } from '@/lib/node-red';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(request: NextRequest) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'No signature' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Invalid signature' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaymentFailed(invoice);
        break;
      }

      case 'customer.updated': {
        const customer = event.data.object as Stripe.Customer;
        await handleCustomerUpdated(customer);
        break;
      }

      case 'setup_intent.succeeded': {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        await handleSetupIntentSucceeded(setupIntent);
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodAttached(paymentMethod);
        break;
      }

      case 'payment_method.detached': {
        const paymentMethod = event.data.object as Stripe.PaymentMethod;
        await handlePaymentMethodDetached(paymentMethod);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (!session.subscription) {
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(
    session.subscription as string
  );

  // organizationId lives on subscription_data.metadata (from /api/stripe/checkout)
  let orgId = session.metadata?.organizationId || subscription.metadata?.organizationId;

  const email = session.customer_email || session.metadata?.email || '';
  const plan = await getPlanFromPriceId(subscription.items.data[0].price.id);

  // If no orgId, look up organization by Stripe customer ID or create one
  if (!orgId) {
    const existingOrg = await prisma.organization.findFirst({
      where: { stripeCustomerId: session.customer as string },
    });
    if (existingOrg) {
      orgId = existingOrg.id;
    } else if (email) {
      // Try to find user's organization
      const zkUser = await prisma.zKUser.findFirst({ where: { email } });
      if (zkUser) {
        const membership = await prisma.organizationUser.findFirst({
          where: { userId: zkUser.id, status: 'active' },
        });
        if (membership) {
          orgId = membership.organizationId;
        }
      }
      // Last resort: create a new organization
      if (!orgId) {
        const newOrg = await prisma.organization.create({
          data: {
            name: `${email}'s Organization`,
            stripeCustomerId: session.customer as string,
          },
        });
        orgId = newOrg.id;
      }
    }
  }

  if (!orgId) {
    console.error('[Stripe Webhook] No organizationId and no user found for:', email);
    return;
  }

  // Access subscription period dates
  const periodStart = (subscription as any).current_period_start;
  const periodEnd = (subscription as any).current_period_end;

  await prisma.organization.update({
    where: { id: orgId },
    data: {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      plan,
      seats: subscription.items.data[0].quantity || 1,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Sync plan to all organization members
  await syncOrgMemberPlans(orgId, plan, session.customer as string, subscription.id);

  // Notify Node-RED → WhatsApp (fire-and-forget)
  notifyPayment({
    event: 'subscription-created',
    email,
    plan,
    amount: session.amount_total || 0,
  });

  console.log(`[Stripe Webhook] checkout.session.completed: org=${orgId} plan=${plan} email=${email}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: subscription.customer as string },
  });

  if (!org) {
    console.error('Organization not found for subscription:', subscription.id);
    return;
  }

  // Access subscription period dates
  const periodStart = (subscription as any).current_period_start;
  const periodEnd = (subscription as any).current_period_end;

  const plan = await getPlanFromPriceId(subscription.items.data[0].price.id);

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      stripeSubscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      plan,
      seats: subscription.items.data[0].quantity || 1,
      currentPeriodStart: periodStart ? new Date(periodStart * 1000) : null,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Sync plan to all organization members
  await syncOrgMemberPlans(org.id, plan, subscription.customer as string, subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const org = await prisma.organization.findFirst({
    where: { stripeSubscriptionId: subscription.id },
  });

  if (!org) {
    return;
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: 'canceled',
      plan: 'free',
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    },
  });

  // Reset organization members to free plan
  await syncOrgMemberPlans(org.id, 'free', null, null);

  // Notify Node-RED → WhatsApp (fire-and-forget)
  notifyPayment({
    event: 'subscription-cancelled',
    email: (subscription.customer as string) || '',
    plan: 'free',
    details: `Subscription ${subscription.id} cancelled`,
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as any).subscription;
  if (!subscriptionId) {
    return;
  }

  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (!org) {
    return;
  }

  // Get invoice period dates
  const periodStart = (invoice as any).period_start || (invoice as any).lines?.data?.[0]?.period?.start;
  const periodEnd = (invoice as any).period_end || (invoice as any).lines?.data?.[0]?.period?.end;

  // Store invoice in database
  await prisma.invoice.upsert({
    where: { stripeInvoiceId: invoice.id },
    update: {
      status: invoice.status || 'paid',
      amountPaid: invoice.amount_paid,
    },
    create: {
      organizationId: org.id,
      stripeInvoiceId: invoice.id,
      amountPaid: invoice.amount_paid,
      amountDue: invoice.amount_due,
      currency: invoice.currency,
      status: invoice.status || 'paid',
      invoicePdf: invoice.invoice_pdf,
      hostedInvoiceUrl: invoice.hosted_invoice_url,
      periodStart: periodStart ? new Date(periodStart * 1000) : new Date(),
      periodEnd: periodEnd ? new Date(periodEnd * 1000) : new Date(),
    },
  });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: invoice.customer as string },
  });

  if (!org) {
    return;
  }

  // Update subscription status
  await prisma.organization.update({
    where: { id: org.id },
    data: {
      subscriptionStatus: 'past_due',
    },
  });

  // Notify Node-RED → WhatsApp (fire-and-forget)
  notifyPayment({
    event: 'payment-failed',
    email: (invoice.customer_email as string) || '',
    amount: invoice.amount_due,
    details: `Invoice ${invoice.id} payment failed`,
  });
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  // Handle customer updates (e.g., default payment method changed)
  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: customer.id },
  });

  if (!org) {
    return;
  }

  // Update payment method if changed
  if (customer.invoice_settings?.default_payment_method) {
    const paymentMethod = await stripe.paymentMethods.retrieve(
      customer.invoice_settings.default_payment_method as string
    );

    await syncPaymentMethod(paymentMethod, org.id, true);
  }
}

async function handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
  const orgId = setupIntent.metadata?.organizationId;
  if (!orgId || !setupIntent.payment_method) {
    return;
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    return;
  }

  const paymentMethod = await stripe.paymentMethods.retrieve(
    setupIntent.payment_method as string
  );

  // Check if this is the first payment method
  const existingMethods = await prisma.paymentMethod.count({
    where: { organizationId: org.id },
  });

  const isDefault = existingMethods === 0;

  await syncPaymentMethod(paymentMethod, org.id, isDefault);

  // If it's the default, update customer's invoice settings
  if (isDefault && org.stripeCustomerId) {
    await stripe.customers.update(org.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethod.id,
      },
    });
  }
}

async function handlePaymentMethodAttached(paymentMethod: Stripe.PaymentMethod) {
  if (!paymentMethod.customer) {
    return;
  }

  const org = await prisma.organization.findFirst({
    where: { stripeCustomerId: paymentMethod.customer as string },
  });

  if (!org) {
    return;
  }

  // Check if method already exists
  const existing = await prisma.paymentMethod.findUnique({
    where: { stripePaymentMethodId: paymentMethod.id },
  });

  if (existing) {
    return;
  }

  // Check if this is the first payment method
  const existingMethods = await prisma.paymentMethod.count({
    where: { organizationId: org.id },
  });

  await syncPaymentMethod(paymentMethod, org.id, existingMethods === 0);
}

async function handlePaymentMethodDetached(paymentMethod: Stripe.PaymentMethod) {
  await prisma.paymentMethod.deleteMany({
    where: { stripePaymentMethodId: paymentMethod.id },
  });
}

async function syncPaymentMethod(
  paymentMethod: Stripe.PaymentMethod,
  organizationId: string,
  isDefault: boolean
) {
  const pmData = extractPaymentMethodData(paymentMethod);

  if (isDefault) {
    // Set all existing methods to non-default
    await prisma.paymentMethod.updateMany({
      where: { organizationId },
      data: { isDefault: false },
    });
  }

  await prisma.paymentMethod.upsert({
    where: { stripePaymentMethodId: paymentMethod.id },
    update: {
      ...pmData,
      isDefault,
    },
    create: {
      organizationId,
      stripePaymentMethodId: paymentMethod.id,
      ...pmData,
      isDefault,
    },
  });
}

function extractPaymentMethodData(paymentMethod: Stripe.PaymentMethod) {
  const type = paymentMethod.type;

  switch (type) {
    case 'card': {
      const card = paymentMethod.card!;
      return {
        type: 'card',
        brand: card.brand,
        last4: card.last4,
        expMonth: card.exp_month,
        expYear: card.exp_year,
        fingerprint: card.fingerprint,
        country: card.country,
        funding: card.funding,
        walletType: card.wallet?.type || null,
        email: null,
      };
    }
    case 'paypal': {
      const paypal = (paymentMethod as any).paypal;
      return {
        type: 'paypal',
        brand: 'paypal',
        last4: paypal?.payer_email?.slice(-4) || null,
        expMonth: null,
        expYear: null,
        fingerprint: paypal?.fingerprint || null,
        country: paypal?.country_code || null,
        funding: null,
        walletType: null,
        email: paypal?.payer_email || null,
      };
    }
    case 'link': {
      const link = (paymentMethod as any).link;
      return {
        type: 'link',
        brand: 'link',
        last4: null,
        expMonth: null,
        expYear: null,
        fingerprint: null,
        country: null,
        funding: null,
        walletType: null,
        email: link?.email || paymentMethod.billing_details?.email || null,
      };
    }
    default:
      return {
        type,
        brand: null,
        last4: null,
        expMonth: null,
        expYear: null,
        fingerprint: null,
        country: null,
        funding: null,
        walletType: null,
        email: paymentMethod.billing_details?.email || null,
      };
  }
}

async function syncOrgMemberPlans(
  organizationId: string,
  plan: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null
) {
  try {
    // Find all web User IDs linked to this organization's ZK users
    const orgMembers = await prisma.organizationUser.findMany({
      where: { organizationId, status: 'active' },
      include: { user: { include: { webUser: true } } },
    });
    const webUserIds = orgMembers
      .map((m) => m.user?.webUser?.id)
      .filter((id): id is string => !!id);

    if (webUserIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: webUserIds } },
        data: {
          plan,
          stripeCustomerId,
          stripeSubscriptionId,
        },
      });
    }
  } catch (err) {
    console.error('[Stripe Webhook] Failed to sync org member plans:', err);
  }
}

async function getPlanFromPriceId(priceId: string): Promise<string> {
  try {
    const offering = await prisma.subscriptionOffering.findFirst({
      where: { stage: 'live', stripePriceId: priceId },
      select: { key: true },
    });
    if (offering?.key) return offering.key;
  } catch {
    // ignore
  }

  // Fallback: env-mapped static price IDs
  const priceToplan: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly']: 'pro',
    [process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly']: 'pro',
    [process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_monthly']: 'team',
    [process.env.STRIPE_TEAM_YEARLY_PRICE_ID || 'price_team_yearly']: 'team',
    [process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_business_monthly']: 'business',
    [process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || 'price_business_yearly']: 'business',
  };

  return priceToplan[priceId] || 'pro';
}
