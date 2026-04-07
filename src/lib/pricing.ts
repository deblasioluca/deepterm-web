// src/lib/pricing.ts
// ============================================================================
// SINGLE SOURCE OF TRUTH for all plan pricing, metadata, and feature lists.
//
// Every UI surface that displays pricing MUST import from this file:
//   - /pricing page (public)
//   - PricingCards component (homepage)
//   - /dashboard/billing page (user dashboard)
//   - /admin/stats MRR calculation
//   - /api/app/tiers (macOS app catalogue)
//   - docs-data.ts (documentation)
//
// To change pricing:
//   1. Update the constants below (fallback prices shown before DB is seeded)
//   2. Go to Admin > Settings > Billing, edit draft offerings, click Deploy
//      — this creates Stripe prices and updates the DB (live offerings)
//   3. All UI surfaces that fetch from /api/billing/offerings will show the
//      new DB prices automatically; these constants are only fallbacks.
// ============================================================================

export type PlanKey = 'starter' | 'pro' | 'team' | 'business';

// ---------------------------------------------------------------------------
// Pricing (in USD) — these are the FALLBACK values used when the DB has no
// live offerings yet.  The admin BillingTab "Deploy" workflow writes the
// authoritative prices to the SubscriptionOffering table + Stripe.
// ---------------------------------------------------------------------------

export interface PlanPricing {
  /** Total annual price (e.g. $49.99/year) — matches Apple App Store tier */
  yearly: number;
  /** Monthly price per seat/month when paying month-to-month */
  monthly: number;
}

export const PRICING: Record<PlanKey, PlanPricing | null> = {
  starter: null, // Free
  pro:      { yearly: 49.99,  monthly: 4.99  },
  team:     { yearly: 99.99,  monthly: 9.99  },
  business: { yearly: 149.99, monthly: 14.99 },
};

/** Convert a plan's annual price to cents (total yearly amount, for Stripe / tiers fallback) */
export function yearlyPriceCents(plan: PlanKey): number {
  const p = PRICING[plan];
  return p ? Math.round(p.yearly * 100) : 0;
}

/** Convert a plan's monthly price to cents */
export function monthlyPriceCents(plan: PlanKey): number {
  const p = PRICING[plan];
  return p ? Math.round(p.monthly * 100) : 0;
}

// ---------------------------------------------------------------------------
// Plan metadata — names, taglines, highlights, features
// ---------------------------------------------------------------------------

export interface PlanMeta {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Short bullet highlights shown on pricing cards */
  highlights: string[];
  /** Full feature list shown on billing/comparison pages */
  features: string[];
  /** Period label shown after the price (e.g. "/month", "/user/month") */
  period: string;
  /** Subtitle shown below the price (e.g. "when paid annually") */
  billingNote: string;
  /** CTA button text */
  cta: string;
  ctaVariant: 'primary' | 'secondary';
  /** Whether to show a "Most Popular" badge */
  popular: boolean;
  /** Whether to show "get a quote" link */
  showQuoteLink: boolean;
}

export const PLANS: PlanMeta[] = [
  {
    key: 'starter',
    name: 'Starter',
    tagline: 'For home lab enthusiasts seeking a modern SSH client.',
    highlights: [
      'SSH and SFTP',
      'Local vault',
      'AI-powered autocomplete',
      'Port Forwarding',
    ],
    features: [
      '3 hosts',
      'Basic terminal',
      'Single device',
      'Local vault',
    ],
    period: '',
    billingNote: 'available for commercial usage',
    cta: 'Get Started',
    ctaVariant: 'secondary',
    popular: false,
    showQuoteLink: false,
  },
  {
    key: 'pro',
    name: 'Pro',
    tagline: 'For individuals responsible for keeping the infrastructure up and running 24/7.',
    highlights: [
      'All Starter features',
      'Personal vault',
      'Sync across mobile and desktop',
      'Snippets Automation',
    ],
    features: [
      'Unlimited hosts',
      'AI terminal assistant',
      'Cloud encrypted vault',
      'All devices',
      'SFTP client',
      'Port forwarding',
      'Priority support',
    ],
    period: '/month',
    billingNote: 'when paid annually',
    cta: 'Try for Free',
    ctaVariant: 'primary',
    popular: true,
    showQuoteLink: false,
  },
  {
    key: 'team',
    name: 'Team',
    tagline: 'For teams that need to manage infrastructure together and stay on the same page.',
    highlights: [
      'All Pro features',
      'Team vault for simple, secure sharing',
      'Real-time collaboration',
      'Consolidated billing',
      'Invite free-tier users \u2014 org covers their seat',
    ],
    features: [
      'Everything in Pro',
      'Team vaults',
      'MultiKey',
      'Real-time collaboration',
      'Admin controls',
      'Audit logs',
    ],
    period: '/user/month',
    billingNote: 'when paid annually',
    cta: 'Try for Free',
    ctaVariant: 'primary',
    popular: false,
    showQuoteLink: true,
  },
  {
    key: 'business',
    name: 'Business',
    tagline: 'For companies requiring access control and advanced security.',
    highlights: [
      'All Team features',
      'Multiple vaults with granular permissions',
      'SOC2 Type II report',
      'Org covers seats for invited members',
      'SAML SSO',
    ],
    features: [
      'Everything in Team',
      'Multiple vaults with granular permissions',
      'SOC2 Type II report',
      'SAML SSO',
      'Dedicated support',
      'SLA guarantee',
    ],
    period: '/user/month',
    billingNote: 'when paid annually',
    cta: 'Try for Free',
    ctaVariant: 'primary',
    popular: false,
    showQuoteLink: true,
  },
];

/** Lookup a single plan by key */
export function getPlan(key: string): PlanMeta | undefined {
  const normalized = key === 'enterprise' ? 'business' : key;
  return PLANS.find((p) => p.key === normalized);
}

/** Format a dollar amount for display (e.g. 5 -> "$5", 6.49 -> "$6.49") */
export function formatUsd(amount: number): string {
  return amount % 1 === 0 ? `$${amount}` : `$${amount.toFixed(2)}`;
}

/** Format cents to USD string (e.g. 500 -> "$5", 649 -> "$6.49") */
export function formatUsdFromCents(cents: number): string {
  return formatUsd(cents / 100);
}

/** Get the display price string for a plan (monthly rate). Returns "Free" for starter. */
export function displayPrice(key: PlanKey): string {
  const p = PRICING[key];
  return p ? formatUsd(p.monthly) : 'Free';
}

// ---------------------------------------------------------------------------
// Feature comparison table — used on /pricing
// ---------------------------------------------------------------------------

export interface FeatureCategory {
  category: string;
  features: Array<{
    name: string;
    starter: boolean;
    pro: boolean;
    team: boolean;
    business: boolean;
  }>;
}

export const FEATURE_COMPARISON: FeatureCategory[] = [
  {
    category: 'Protocols',
    features: [
      { name: 'SSH', starter: true, pro: true, team: true, business: true },
      { name: 'SFTP', starter: true, pro: true, team: true, business: true },
      { name: 'Telnet', starter: true, pro: true, team: true, business: true },
      { name: 'Serial', starter: true, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Terminal',
    features: [
      { name: 'Split View', starter: true, pro: true, team: true, business: true },
      { name: 'Unlimited Tabs', starter: true, pro: true, team: true, business: true },
      { name: 'Command Snippets', starter: true, pro: true, team: true, business: true },
      { name: 'AI-powered autocomplete', starter: true, pro: true, team: true, business: true },
      { name: 'AI Chat Assistant', starter: false, pro: true, team: true, business: true },
      { name: 'Snippets Automation', starter: false, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Sync & Sharing',
    features: [
      { name: 'Local Vault', starter: true, pro: true, team: true, business: true },
      { name: 'Personal Vault (Cloud)', starter: false, pro: true, team: true, business: true },
      { name: 'Sync across mobile and desktop', starter: false, pro: true, team: true, business: true },
      { name: 'Team Vault', starter: false, pro: false, team: true, business: true },
      { name: 'Multiple Vaults with granular permissions', starter: false, pro: false, team: false, business: true },
    ],
  },
  {
    category: 'Integrations',
    features: [
      { name: 'AWS', starter: false, pro: true, team: true, business: true },
      { name: 'DigitalOcean', starter: false, pro: true, team: true, business: true },
    ],
  },
  {
    category: 'Security',
    features: [
      { name: 'macOS Keychain Storage', starter: true, pro: true, team: true, business: true },
      { name: 'Biometric Keys (TouchID/FaceID)', starter: true, pro: true, team: true, business: true },
      { name: 'PIN Lock', starter: true, pro: true, team: true, business: true },
      { name: 'Session Logs', starter: false, pro: true, team: true, business: true },
      { name: 'SSH Certificates', starter: false, pro: false, team: true, business: true },
      { name: 'FIDO2', starter: false, pro: false, team: true, business: true },
      { name: 'SAML SSO', starter: false, pro: false, team: false, business: true },
      { name: 'SOC 2 Type II Report', starter: false, pro: false, team: false, business: true },
    ],
  },
];

// ---------------------------------------------------------------------------
// Pricing FAQ — used on /pricing
// ---------------------------------------------------------------------------

export const PRICING_FAQS = [
  {
    q: 'What payment methods do you accept?',
    a: 'Credit card on our website, or purchase order with invoice payable by check or bank transfer for annual plans.',
  },
  {
    q: 'Can I switch plans later?',
    a: 'Yes, you can upgrade or downgrade at any time. Changes are prorated.',
  },
  {
    q: 'Is there a discount for annual billing?',
    a: 'Yes, all listed prices reflect annual billing. Monthly billing is available at a higher rate.',
  },
  {
    q: 'Do you offer academic/student pricing?',
    a: 'Yes! Eligible students get DeepTerm Pro for free through our student program. Verify your student status in the dashboard.',
  },
  {
    q: 'Does DeepTerm require a subscription?',
    a: 'The Starter plan is completely free. Pro, Team, and Business are subscription-based.',
  },
  {
    q: 'Can I try before I buy?',
    a: 'Absolutely. All paid plans include a free trial period. No credit card required to start.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'Your data remains in your local vault. Cloud vault data can be exported before cancellation.',
  },
];

// ---------------------------------------------------------------------------
// Testimonials — used on /pricing
// ---------------------------------------------------------------------------

export const TESTIMONIALS = [
  {
    quote: "DeepTerm has become essential for our DevOps team. The split terminal views alone save us hours every week.",
    author: 'Michael Torres',
    title: 'VP of Engineering',
    company: 'CloudOps Solutions',
  },
  {
    quote: "Finally, an SSH client that takes security seriously. The Keychain integration gives us peace of mind.",
    author: 'Amanda Lee',
    title: 'Security Architect',
    company: 'FinSecure Inc.',
  },
];

// ---------------------------------------------------------------------------
// Helper: generate pricing HTML for docs-data.ts
// ---------------------------------------------------------------------------

export function pricingDocsHtml(): string {
  const paid = PLANS.filter((p) => PRICING[p.key]);
  const lines = paid.map((p) => {
    const pr = PRICING[p.key]!;
    const perUser = p.key === 'team' || p.key === 'business' ? '/user' : '';
    return `<li><strong>${p.name} (${formatUsd(pr.monthly)}${perUser}/mo)</strong> \u2014 ${p.features.join(', ').toLowerCase()}.</li>`;
  });
  return `<ul>\n  ${lines.join('\n  ')}\n</ul>`;
}
