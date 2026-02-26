import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const APP_API_KEY = process.env.APP_API_KEY || '';

const TIER_ORDER = ['starter', 'pro', 'team', 'business'] as const;
type TierKey = (typeof TIER_ORDER)[number];

const TIER_METADATA: Record<TierKey, {
  name: string;
  description: string;
  highlights: string[];
  features: Record<string, boolean>;
  limits: Record<string, number>;
}> = {
  starter: {
    name: 'Starter',
    description: 'For individuals getting started with DeepTerm.',
    highlights: [
      '5 SSH hosts',
      'Basic terminal',
      'Single device',
      'Local vault',
    ],
    features: {
      unlimitedHosts: false,
      aiAssistant: false,
      cloudVault: false,
      allDevices: false,
      sftpClient: false,
      portForwarding: false,
      prioritySupport: false,
      teamVaults: false,
      sso: false,
      auditLogs: false,
      roleBasedAccess: false,
    },
    limits: {
      maxHosts: 5,
      maxVaults: 1,
      maxDevices: 1,
    },
  },
  pro: {
    name: 'Pro',
    description: 'For professional developers who need full power and cloud sync.',
    highlights: [
      'Unlimited hosts',
      'AI terminal assistant',
      'Cloud encrypted vault',
      'All devices',
      'SFTP client',
      'Port forwarding',
      'Priority support',
    ],
    features: {
      unlimitedHosts: true,
      aiAssistant: true,
      cloudVault: true,
      allDevices: true,
      sftpClient: true,
      portForwarding: true,
      prioritySupport: true,
      teamVaults: false,
      sso: false,
      auditLogs: false,
      roleBasedAccess: false,
    },
    limits: {
      maxHosts: -1,
      maxVaults: 10,
      maxDevices: -1,
    },
  },
  team: {
    name: 'Team',
    description: 'For teams that need shared vaults, SSO, and audit logs.',
    highlights: [
      'Everything in Pro',
      'Team vaults',
      'Real-time collaboration',
      'SSO / SAML',
      'Admin controls',
      'Audit logs',
    ],
    features: {
      unlimitedHosts: true,
      aiAssistant: true,
      cloudVault: true,
      allDevices: true,
      sftpClient: true,
      portForwarding: true,
      prioritySupport: true,
      teamVaults: true,
      sso: true,
      auditLogs: true,
      roleBasedAccess: true,
    },
    limits: {
      maxHosts: -1,
      maxVaults: -1,
      maxDevices: -1,
    },
  },
  business: {
    name: 'Business',
    description: 'For enterprises requiring advanced security, compliance, and dedicated support.',
    highlights: [
      'Everything in Team',
      'Granular vault permissions',
      'SOC2 Type II report',
      'SAML SSO',
      'Dedicated support',
      'SLA guarantee',
    ],
    features: {
      unlimitedHosts: true,
      aiAssistant: true,
      cloudVault: true,
      allDevices: true,
      sftpClient: true,
      portForwarding: true,
      prioritySupport: true,
      teamVaults: true,
      sso: true,
      auditLogs: true,
      roleBasedAccess: true,
    },
    limits: {
      maxHosts: -1,
      maxVaults: -1,
      maxDevices: -1,
    },
  },
};

/**
 * GET /api/app/tiers
 * Return the full catalogue of subscription tiers with features, limits, and live pricing.
 * Auth: x-api-key header (required)
 */
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== APP_API_KEY) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
  }

  try {
    // Fetch live prices from the database (admin-configurable)
    const offerings = await prisma.subscriptionOffering.findMany({
      where: { stage: 'live', isActive: true },
      select: {
        key: true,
        interval: true,
        priceCents: true,
        currency: true,
        stripePriceId: true,
      },
    });

    // Index by "key::interval" for O(1) lookup
    const offeringMap: Record<string, {
      priceCents: number;
      currency: string;
      stripePriceId: string | null;
    }> = {};
    for (const o of offerings) {
      offeringMap[`${o.key}::${o.interval}`] = {
        priceCents: o.priceCents,
        currency: o.currency,
        stripePriceId: o.stripePriceId,
      };
    }

    const tiers = TIER_ORDER.map((key) => {
      const meta = TIER_METADATA[key];
      const isStarter = key === 'starter';

      const monthlyOffering = offeringMap[`${key}::monthly`];
      const yearlyOffering = offeringMap[`${key}::yearly`];

      return {
        key,
        name: meta.name,
        description: meta.description,
        highlights: meta.highlights,
        features: meta.features,
        limits: meta.limits,
        pricing: {
          monthly: monthlyOffering
            ? {
                priceCents: monthlyOffering.priceCents,
                currency: monthlyOffering.currency,
                stripePriceId: monthlyOffering.stripePriceId,
              }
            : isStarter
            ? { priceCents: 0, currency: 'usd', stripePriceId: null }
            : null,
          yearly: yearlyOffering
            ? {
                priceCents: yearlyOffering.priceCents,
                currency: yearlyOffering.currency,
                stripePriceId: yearlyOffering.stripePriceId,
              }
            : isStarter
            ? { priceCents: 0, currency: 'usd', stripePriceId: null }
            : null,
        },
      };
    });

    return NextResponse.json({ tiers });
  } catch (error) {
    console.error('Failed to fetch tiers:', error);
    return NextResponse.json({ error: 'Failed to fetch tiers' }, { status: 500 });
  }
}
