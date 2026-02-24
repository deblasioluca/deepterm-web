import Stripe from 'stripe';

// Lazy initialization of Stripe to avoid build-time errors
let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return stripeInstance;
}

// Keep backward compatibility
export const stripe = {
  get customers() { return getStripe().customers; },
  get subscriptions() { return getStripe().subscriptions; },
  get checkout() { return getStripe().checkout; },
  get billingPortal() { return getStripe().billingPortal; },
  get webhooks() { return getStripe().webhooks; },
  get paymentMethods() { return getStripe().paymentMethods; },
  get invoices() { return getStripe().invoices; },
  get setupIntents() { return getStripe().setupIntents; },
};

// Price IDs for each plan (configure these in Stripe Dashboard)
export const PRICE_IDS: Record<string, { monthly: string; yearly: string } | null> = {
  starter: null, // Free plan
  pro: {
    monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
    yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
  },
  team: {
    monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_monthly',
    yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || 'price_team_yearly',
  },
  business: {
    monthly: process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_business_monthly',
    yearly: process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || 'price_business_yearly',
  },
};

export const PLAN_DETAILS = {
  starter: {
    name: 'Starter',
    price: 0,
    features: ['5 hosts', 'Basic terminal', 'Single device', 'Local vault'],
  },
  pro: {
    name: 'Pro',
    price: 10, // per seat/month (annual)
    monthlyPrice: 12.99,
    features: [
      'Unlimited hosts',
      'AI terminal assistant',
      'Cloud encrypted vault',
      'All devices',
      'SFTP client',
      'Port forwarding',
      'Priority support',
    ],
  },
  team: {
    name: 'Team',
    price: 20, // per seat/month (annual)
    monthlyPrice: 24.99,
    features: [
      'Everything in Pro',
      'Team vaults',
      'MultiKey',
      'Real-time collaboration',
      'SSO/SAML',
      'Admin controls',
      'Audit logs',
    ],
  },
  enterprise: {
    name: 'Business',
    price: 30, // per user/month (annual)
    monthlyPrice: 39.99,
    features: [
      'Everything in Team',
      'Multiple vaults with granular permissions',
      'SOC2 Type II report',
      'SAML SSO',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
  business: {
    name: 'Business',
    price: 30, // per user/month (annual)
    monthlyPrice: 39.99,
    features: [
      'Everything in Team',
      'Multiple vaults with granular permissions',
      'SOC2 Type II report',
      'SAML SSO',
      'Dedicated support',
      'SLA guarantee',
    ],
  },
};

export type PlanType = keyof typeof PLAN_DETAILS;

// Create or get a Stripe customer for a team
export async function getOrCreateStripeCustomer(
  teamId: string,
  email: string,
  name: string
): Promise<Stripe.Customer> {
  const { prisma } = await import('./prisma');
  
  const team = await prisma.team.findUnique({
    where: { id: teamId },
  });

  if (team?.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(team.stripeCustomerId);
    if (!customer.deleted) {
      return customer as Stripe.Customer;
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      teamId,
    },
  });

  // Update team with Stripe customer ID
  await prisma.team.update({
    where: { id: teamId },
    data: { stripeCustomerId: customer.id },
  });

  return customer;
}

// Create a checkout session for subscription
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  teamId: string,
  seats: number = 1,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [
      {
        price: priceId,
        quantity: seats,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: {
        teamId,
      },
    },
    // Enable multiple payment methods: cards, Apple Pay, Google Pay, PayPal, Link
    payment_method_types: ['card', 'paypal', 'link'],
    // Apple Pay and Google Pay are automatically enabled through the 'card' payment method
    allow_promotion_codes: true,
    billing_address_collection: 'required',
  });
}

// Create a customer portal session
export async function createPortalSession(
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// Update subscription quantity (seats)
export async function updateSubscriptionSeats(
  subscriptionId: string,
  seats: number
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        quantity: seats,
      },
    ],
    proration_behavior: 'create_prorations',
  });
}

// Cancel subscription at period end
export async function cancelSubscription(
  subscriptionId: string,
  immediately: boolean = false
): Promise<Stripe.Subscription> {
  if (immediately) {
    return stripe.subscriptions.cancel(subscriptionId);
  }
  
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

// Resume canceled subscription
export async function resumeSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

// Get subscription details
export async function getSubscription(
  subscriptionId: string
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['default_payment_method', 'latest_invoice'],
  });
}

// Get invoices for a customer
export async function getCustomerInvoices(
  customerId: string,
  limit: number = 10
): Promise<Stripe.Invoice[]> {
  const invoices = await stripe.invoices.list({
    customer: customerId,
    limit,
    expand: ['data.subscription'],
  });
  
  return invoices.data;
}

// Change subscription plan
export async function changeSubscriptionPlan(
  subscriptionId: string,
  newPriceId: string
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  return stripe.subscriptions.update(subscriptionId, {
    items: [
      {
        id: subscription.items.data[0].id,
        price: newPriceId,
      },
    ],
    proration_behavior: 'create_prorations',
  });
}

// Get customer's payment methods
export async function getCustomerPaymentMethods(
  customerId: string,
  types: Stripe.PaymentMethodListParams.Type[] = ['card', 'paypal', 'link']
): Promise<Stripe.PaymentMethod[]> {
  const allMethods: Stripe.PaymentMethod[] = [];
  
  for (const type of types) {
    try {
      const methods = await stripe.paymentMethods.list({
        customer: customerId,
        type,
      });
      allMethods.push(...methods.data);
    } catch (err) {
      // Some payment method types might not be enabled
      console.log(`Payment method type ${type} not available`);
    }
  }
  
  return allMethods;
}

// Attach a payment method to a customer
export async function attachPaymentMethod(
  paymentMethodId: string,
  customerId: string
): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  });
}

// Detach a payment method
export async function detachPaymentMethod(
  paymentMethodId: string
): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.detach(paymentMethodId);
}

// Set default payment method for a customer
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<Stripe.Customer> {
  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  }) as Promise<Stripe.Customer>;
}

// Create a setup intent for saving payment methods
export async function createSetupIntent(
  customerId: string,
  options?: {
    paymentMethodTypes?: string[];
    metadata?: Record<string, string>;
  }
): Promise<Stripe.SetupIntent> {
  return stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: options?.paymentMethodTypes || ['card', 'paypal', 'link'],
    usage: 'off_session',
    metadata: options?.metadata,
  });
}

// Sync payment methods from Stripe to database
export async function syncPaymentMethodsFromStripe(
  customerId: string,
  teamId: string
): Promise<void> {
  const { prisma } = await import('./prisma');
  
  const paymentMethods = await getCustomerPaymentMethods(customerId);
  
  // Get current default
  const customer = await stripe.customers.retrieve(customerId);
  const defaultMethodId = 
    !('deleted' in customer) && customer.invoice_settings?.default_payment_method
      ? (typeof customer.invoice_settings.default_payment_method === 'string'
          ? customer.invoice_settings.default_payment_method
          : customer.invoice_settings.default_payment_method.id)
      : null;
  
  for (const pm of paymentMethods) {
    const pmData = extractPaymentMethodData(pm);
    const isDefault = pm.id === defaultMethodId;
    
    await prisma.paymentMethod.upsert({
      where: { stripePaymentMethodId: pm.id },
      update: {
        ...pmData,
        isDefault,
      },
      create: {
        teamId,
        stripePaymentMethodId: pm.id,
        ...pmData,
        isDefault,
      },
    });
  }
}

// Helper to extract payment method data
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
