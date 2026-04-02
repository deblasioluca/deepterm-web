import Stripe from 'stripe';

// ---------------------------------------------------------------------------
// Runtime Stripe key management
//
// Keys are resolved in this priority order:
//   1. Active StripeKeySet row in the DB  (admin-configurable)
//   2. process.env.STRIPE_SECRET_KEY      (fallback / legacy)
//
// Call `switchStripeMode('sandbox' | 'production')` from the admin API
// to toggle the active key set. This resets the cached Stripe instance
// so the next call to getStripe() picks up the new keys.
// ---------------------------------------------------------------------------

interface RuntimeKeys {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string | null;
  priceIds: StripePriceIds;
}

export interface StripePriceIds {
  proMonthly: string;
  proYearly: string;
  teamMonthly: string;
  teamYearly: string;
  businessMonthly: string;
  businessYearly: string;
}

let stripeInstance: Stripe | null = null;
let runtimeKeys: RuntimeKeys | null = null;
let keysLoadedPromise: Promise<void> | null = null;

/**
 * Ensure DB key set is loaded once after server restart.
 * Safe to call from every route — only hits DB on the first invocation.
 */
export function ensureKeysLoaded(): Promise<void> {
  if (!keysLoadedPromise) {
    keysLoadedPromise = loadActiveKeySet().then(() => {});
  }
  return keysLoadedPromise;
}

/** Resolve the secret key currently in use (DB override or env). */
export function activeSecretKey(): string {
  return runtimeKeys?.secretKey || process.env.STRIPE_SECRET_KEY || '';
}

/**
 * Returns true when the app is configured to use Stripe's test/sandbox keys.
 * Stripe test keys always start with "sk_test_" / "pk_test_".
 */
export function isStripeSandbox(): boolean {
  const key = activeSecretKey();
  return key.startsWith('sk_test_') || key.startsWith('rk_test_');
}

/** Dashboard base URL — changes depending on live vs test mode. */
export function stripeDashboardUrl(): string {
  return isStripeSandbox()
    ? 'https://dashboard.stripe.com/test'
    : 'https://dashboard.stripe.com';
}

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = activeSecretKey();
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables or StripeKeySet DB');
    }
    stripeInstance = new Stripe(key, {
      typescript: true,
    });
  }
  return stripeInstance;
}

/** Reset the cached Stripe client — call after switching keys. */
export function resetStripeInstance(): void {
  stripeInstance = null;
}

/**
 * Load the active StripeKeySet from the DB and cache it in memory.
 * Called on first request and after mode switches.
 */
export async function loadActiveKeySet(): Promise<RuntimeKeys | null> {
  const { prisma } = await import('./prisma');
  const active = await prisma.stripeKeySet.findFirst({ where: { isActive: true } });
  if (!active) {
    runtimeKeys = null;
    resetStripeInstance();
    return null;
  }

  const parsed = active.priceIds ? JSON.parse(active.priceIds) as Partial<StripePriceIds> : {};
  runtimeKeys = {
    secretKey: active.secretKey,
    publishableKey: active.publishableKey,
    webhookSecret: active.webhookSecret,
    priceIds: {
      proMonthly: parsed.proMonthly || process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
      proYearly: parsed.proYearly || process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
      teamMonthly: parsed.teamMonthly || process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_monthly',
      teamYearly: parsed.teamYearly || process.env.STRIPE_TEAM_YEARLY_PRICE_ID || 'price_team_yearly',
      businessMonthly: parsed.businessMonthly || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_business_monthly',
      businessYearly: parsed.businessYearly || process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || 'price_business_yearly',
    },
  };
  resetStripeInstance();
  return runtimeKeys;
}

/**
 * Switch Stripe mode by activating the given key set and deactivating others.
 * Returns the newly-active key set, or null if the mode doesn't exist.
 */
export async function switchStripeMode(mode: 'sandbox' | 'production'): Promise<RuntimeKeys | null> {
  const { prisma } = await import('./prisma');

  // Verify the target mode exists before deactivating anything
  const target = await prisma.stripeKeySet.findFirst({ where: { mode } });
  if (!target) return null;

  // Deactivate all, then activate the requested mode — in a single transaction
  await prisma.$transaction(async (tx) => {
    await tx.stripeKeySet.updateMany({ data: { isActive: false } });
    await tx.stripeKeySet.updateMany({
      where: { mode },
      data: { isActive: true },
    });
  });

  return loadActiveKeySet();
}

/** Get the publishable key for client-side use. */
export function getPublishableKey(): string {
  return runtimeKeys?.publishableKey
    || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    || '';
}

/** Get the webhook secret — prefers DB key set, falls back to env var. */
export function getWebhookSecret(): string {
  return runtimeKeys?.webhookSecret
    || process.env.STRIPE_WEBHOOK_SECRET
    || '';
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

// Price IDs for each plan — resolved from DB key set first, then env vars
function resolvePriceIds(): Record<string, { monthly: string; yearly: string } | null> {
  const ids = runtimeKeys?.priceIds;
  return {
    starter: null,
    pro: {
      monthly: ids?.proMonthly || process.env.STRIPE_PRO_MONTHLY_PRICE_ID || 'price_pro_monthly',
      yearly: ids?.proYearly || process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_pro_yearly',
    },
    team: {
      monthly: ids?.teamMonthly || process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || 'price_team_monthly',
      yearly: ids?.teamYearly || process.env.STRIPE_TEAM_YEARLY_PRICE_ID || 'price_team_yearly',
    },
    business: {
      monthly: ids?.businessMonthly || process.env.STRIPE_BUSINESS_MONTHLY_PRICE_ID || 'price_business_monthly',
      yearly: ids?.businessYearly || process.env.STRIPE_BUSINESS_YEARLY_PRICE_ID || 'price_business_yearly',
    },
  };
}

// Exported as a getter so it always reflects the active key set
const PRICE_ID_KEYS = ['starter', 'pro', 'team', 'business'];
export const PRICE_IDS: Record<string, { monthly: string; yearly: string } | null> = new Proxy(
  {} as Record<string, { monthly: string; yearly: string } | null>,
  {
    get: (_target, prop: string) => resolvePriceIds()[prop],
    ownKeys: () => PRICE_ID_KEYS,
    getOwnPropertyDescriptor: (_target, prop: string) => ({
      configurable: true,
      enumerable: true,
      value: resolvePriceIds()[prop as string],
    }),
  },
);

// PLAN_DETAILS is derived from the single source of truth in pricing.ts.
// Do NOT hardcode prices here — update src/lib/pricing.ts instead.
import { PLANS, PRICING, type PlanKey } from '@/lib/pricing';

function buildPlanDetails() {
  const details: Record<string, {
    name: string;
    price: number;
    monthlyPrice?: number;
    features: string[];
  }> = {};

  for (const plan of PLANS) {
    const pr = PRICING[plan.key];
    details[plan.key] = {
      name: plan.name,
      price: pr?.yearlyPerMonth ?? 0,
      ...(pr ? { monthlyPrice: pr.monthly } : {}),
      features: plan.features,
    };
  }
  // Keep legacy 'enterprise' alias pointing to 'business'
  details['enterprise'] = details['business'];
  return details;
}

export const PLAN_DETAILS = buildPlanDetails();

export type PlanType = PlanKey | 'enterprise';

// Create or get a Stripe customer for an organization
export async function getOrCreateStripeCustomer(
  organizationId: string,
  email: string,
  name: string
): Promise<Stripe.Customer> {
  const { prisma } = await import('./prisma');
  
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
  });

  if (org?.stripeCustomerId) {
    const customer = await stripe.customers.retrieve(org.stripeCustomerId);
    if (!customer.deleted) {
      return customer as Stripe.Customer;
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      organizationId,
    },
  });

  // Update organization with Stripe customer ID
  await prisma.organization.update({
    where: { id: organizationId },
    data: { stripeCustomerId: customer.id },
  });

  return customer;
}

// Create a checkout session for subscription
export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  organizationId: string,
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
        organizationId,
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
  organizationId: string
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
        organizationId,
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
