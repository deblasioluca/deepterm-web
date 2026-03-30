/**
 * Admin-scoped tools for the email LLM draft generation.
 *
 * These tools allow Claude to dynamically look up user data, subscription details,
 * billing history, issues, announcements, and pricing — replacing hardcoded prompt
 * knowledge with live database queries.
 *
 * Unlike the user-facing MCP server (src/lib/mcp/server.ts), these tools are
 * admin-scoped: they look up ANY user by email for support response generation.
 */

import type Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';

// ── Tool Definitions (Claude tool-use schema) ────────────────────────────────

export const EMAIL_TOOLS: Anthropic.Messages.Tool[] = [
  // ── Tier 1: Must-have ──────────────────────────
  {
    name: 'lookup_user_subscription',
    description:
      'Look up a customer\'s subscription plan, source (organization or Apple IAP), billing period, renewal date, payment method, and organization membership. Use this for ANY email about subscriptions, billing, plans, or account status.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'lookup_user_profile',
    description:
      'Look up a customer\'s account profile: account age, registered devices, vault item counts, email verification status, and organization roles. Use this to understand the customer\'s usage level.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_subscription_plans',
    description:
      'Get the current DeepTerm subscription plans and pricing from the database. Use this instead of guessing prices — pricing may have changed.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },

  // ── Tier 2: Better responses ───────────────────
  {
    name: 'lookup_user_issues',
    description:
      'Look up a customer\'s open bug reports and support tickets. Use this to check if the customer has existing issues or to reference them in the response.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
        status: {
          type: 'string',
          enum: ['open', 'in-progress', 'resolved', 'closed'],
          description: 'Filter by issue status. Omit to return all.',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'lookup_user_invoices',
    description:
      'Look up a customer\'s recent billing invoices. Use this for billing inquiries to check payment history, amounts, and periods.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
        limit: {
          type: 'number',
          description: 'Max invoices to return (default 5).',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'lookup_user_payment_events',
    description:
      'Look up a customer\'s recent payment events: purchases, renewals, cancellations. Use this for billing disputes or to verify payment activity.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
        limit: {
          type: 'number',
          description: 'Max events to return (default 5).',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_known_issues',
    description:
      'Get currently open/in-progress bug reports and known issues. Use this to proactively mention if there\'s a known issue that might affect the customer.',
    input_schema: {
      type: 'object' as const,
      properties: {
        area: {
          type: 'string',
          description: 'Filter by area (e.g. "Vault", "SSH", "Billing"). Omit to return all.',
        },
      },
      required: [],
    },
  },

  // ── Tier 3: Nice-to-have ───────────────────────
  {
    name: 'get_announcements',
    description:
      'Get active product announcements and updates. Use this to include relevant news in responses (e.g. upcoming features, maintenance windows).',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'lookup_email_history',
    description:
      'Look up previous support email conversations with this customer. Use this to avoid repeating advice and to reference prior interactions.',
    input_schema: {
      type: 'object' as const,
      properties: {
        email: {
          type: 'string',
          description: 'The customer\'s email address.',
        },
        limit: {
          type: 'number',
          description: 'Max previous emails to return (default 5).',
        },
      },
      required: ['email'],
    },
  },
  {
    name: 'get_feature_roadmap',
    description:
      'Get planned and in-progress feature ideas from the voting board. Use this to respond to feature requests with what\'s already planned.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['consideration', 'planned', 'in-progress', 'launched'],
          description: 'Filter by status. Omit to return planned + in-progress.',
        },
      },
      required: [],
    },
  },
];

// ── Tool Execution ───────────────────────────────────────────────────────────

/**
 * Execute an email LLM tool call and return the result as a string.
 */
export async function executeEmailTool(
  toolName: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (toolName) {
    case 'lookup_user_subscription':
      return lookupUserSubscription(input.email as string);
    case 'lookup_user_profile':
      return lookupUserProfile(input.email as string);
    case 'get_subscription_plans':
      return getSubscriptionPlans();
    case 'lookup_user_issues':
      return lookupUserIssues(input.email as string, input.status as string | undefined);
    case 'lookup_user_invoices':
      return lookupUserInvoices(input.email as string, (input.limit as number) ?? 5);
    case 'lookup_user_payment_events':
      return lookupUserPaymentEvents(input.email as string, (input.limit as number) ?? 5);
    case 'get_known_issues':
      return getKnownIssues(input.area as string | undefined);
    case 'get_announcements':
      return getAnnouncements();
    case 'lookup_email_history':
      return lookupEmailHistory(input.email as string, (input.limit as number) ?? 5);
    case 'get_feature_roadmap':
      return getFeatureRoadmap(input.status as string | undefined);
    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ── Tool Implementations ─────────────────────────────────────────────────────

async function lookupUserSubscription(email: string): Promise<string> {
  const zkUser = await prisma.zKUser.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      appleProductId: true,
      appleExpiresDate: true,
      applePurchaseDate: true,
      createdAt: true,
      organizationUsers: {
        include: {
          organization: {
            include: {
              paymentMethods: {
                where: { isDefault: true },
                select: { type: true, brand: true, last4: true, expMonth: true, expYear: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!zkUser) {
    return JSON.stringify({
      found: false,
      message: `No DeepTerm account found for ${email}. This person is not a registered user.`,
    });
  }

  // Determine subscription source
  const orgMemberships = zkUser.organizationUsers.map((ou) => {
    const org = ou.organization;
    return {
      organizationName: org.name,
      role: ou.role,
      status: ou.status,
      seatCoveredByOrg: ou.seatCoveredByOrg,
      orgPlan: org.plan,
      orgSubscriptionStatus: org.subscriptionStatus,
      orgSeats: org.seats,
      orgBillingPeriodStart: org.currentPeriodStart?.toISOString().slice(0, 10) ?? null,
      orgBillingPeriodEnd: org.currentPeriodEnd?.toISOString().slice(0, 10) ?? null,
      orgCancelAtPeriodEnd: org.cancelAtPeriodEnd,
      orgMemberBillingMode: org.memberBillingMode,
      paymentMethod: org.paymentMethods[0]
        ? {
            type: org.paymentMethods[0].type,
            brand: org.paymentMethods[0].brand,
            last4: org.paymentMethods[0].last4,
            expiry: `${org.paymentMethods[0].expMonth}/${org.paymentMethods[0].expYear}`,
          }
        : null,
    };
  });

  const orgPro = orgMemberships.find(
    (m) => m.orgPlan === 'pro' && m.orgSubscriptionStatus === 'active',
  );
  const appleActive = !!zkUser.appleProductId
    && (!zkUser.appleExpiresDate || zkUser.appleExpiresDate > new Date());

  let subscriptionSource = 'none';
  if (orgPro) subscriptionSource = 'organization';
  else if (appleActive) subscriptionSource = 'apple_iap';

  const result = {
    found: true,
    email: zkUser.email,
    effectivePlan: orgPro || appleActive ? 'pro' : 'free',
    subscriptionSource,
    organizations: orgMemberships,
    appleIAP: zkUser.appleProductId
      ? {
          productId: zkUser.appleProductId,
          purchaseDate: zkUser.applePurchaseDate?.toISOString().slice(0, 10) ?? null,
          expiresDate: zkUser.appleExpiresDate?.toISOString().slice(0, 10) ?? null,
          isActive: appleActive,
        }
      : null,
    accountCreated: zkUser.createdAt.toISOString().slice(0, 10),
  };

  return JSON.stringify(result, null, 2);
}

async function lookupUserProfile(email: string): Promise<string> {
  const zkUser = await prisma.zKUser.findUnique({
    where: { email: email.toLowerCase() },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      kdfType: true,
      kdfIterations: true,
      createdAt: true,
      devices: {
        select: { id: true, name: true, deviceType: true, lastActive: true },
        orderBy: { lastActive: 'desc' },
      },
      organizationUsers: {
        include: { organization: { select: { name: true, plan: true } } },
      },
      zkVaults: {
        select: { id: true, name: true, isDefault: true },
      },
      zkVaultItems: {
        select: { id: true, type: true, deletedAt: true },
      },
    },
  });

  if (!zkUser) {
    return JSON.stringify({
      found: false,
      message: `No DeepTerm account found for ${email}.`,
    });
  }

  const activeItems = zkUser.zkVaultItems.filter((i) => !i.deletedAt);
  const itemsByType: Record<string, number> = {};
  for (const item of activeItems) {
    const typeName = itemTypeName(item.type);
    itemsByType[typeName] = (itemsByType[typeName] || 0) + 1;
  }

  return JSON.stringify({
    found: true,
    email: zkUser.email,
    emailVerified: zkUser.emailVerified,
    accountCreated: zkUser.createdAt.toISOString().slice(0, 10),
    devices: zkUser.devices.map((d) => ({
      name: d.name,
      type: d.deviceType,
      lastActive: d.lastActive?.toISOString().slice(0, 10) ?? null,
    })),
    deviceCount: zkUser.devices.length,
    vaults: zkUser.zkVaults.map((v) => ({ name: v.name, isDefault: v.isDefault })),
    vaultCount: zkUser.zkVaults.length,
    totalCredentials: activeItems.length,
    credentialsByType: itemsByType,
    organizations: zkUser.organizationUsers.map((ou) => ({
      name: ou.organization.name,
      plan: ou.organization.plan,
      role: ou.role,
    })),
  }, null, 2);
}

async function getSubscriptionPlans(): Promise<string> {
  const plans = await prisma.subscriptionOffering.findMany({
    where: { isActive: true, stage: 'live' },
    orderBy: { priceCents: 'asc' },
    select: {
      key: true,
      name: true,
      description: true,
      interval: true,
      priceCents: true,
      currency: true,
    },
  });

  if (plans.length === 0) {
    return JSON.stringify({
      plans: [
        { name: 'Free', interval: 'forever', price: '$0', features: 'Basic vault (10 credentials), single device, 1 vault' },
        { name: 'Pro Monthly', interval: 'month', price: '$4.99/mo', features: 'Unlimited credentials, devices, vaults, team collaboration, AI features, priority support' },
        { name: 'Pro Yearly', interval: 'year', price: '$49.99/yr', features: 'Same as Pro Monthly, save ~17%' },
      ],
      note: 'Prices from fallback — SubscriptionOffering table is empty.',
    });
  }

  const formatted = plans.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    interval: p.interval,
    price: `${(p.priceCents / 100).toFixed(2)} ${p.currency.toUpperCase()}/${p.interval}`,
    priceCents: p.priceCents,
  }));

  return JSON.stringify({ plans: formatted }, null, 2);
}

async function lookupUserIssues(
  email: string,
  status?: string,
): Promise<string> {
  // Find the web user ID via ZKUser → webUserId → User
  const zkUser = await prisma.zKUser.findUnique({
    where: { email: email.toLowerCase() },
    select: { webUserId: true },
  });

  if (!zkUser?.webUserId) {
    return JSON.stringify({ found: false, issues: [], message: 'No linked web account.' });
  }

  const where: Record<string, unknown> = { userId: zkUser.webUserId };
  if (status) where.status = status;

  const issues = await prisma.issue.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      area: true,
      status: true,
      priority: true,
      createdAt: true,
      updatedAt: true,
      firstResponseAt: true,
    },
  });

  return JSON.stringify({
    found: true,
    totalIssues: issues.length,
    issues: issues.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString().slice(0, 10),
      updatedAt: i.updatedAt.toISOString().slice(0, 10),
      firstResponseAt: i.firstResponseAt?.toISOString().slice(0, 10) ?? null,
    })),
  }, null, 2);
}

async function lookupUserInvoices(email: string, limit: number): Promise<string> {
  const zkUser = await prisma.zKUser.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  if (!zkUser) {
    return JSON.stringify({ found: false, invoices: [], message: 'User not found.' });
  }

  const membership = await prisma.organizationUser.findFirst({
    where: { userId: zkUser.id, status: 'confirmed' },
    select: { organizationId: true },
  });

  if (!membership) {
    return JSON.stringify({ found: true, invoices: [], message: 'No organization billing account.' });
  }

  const invoices = await prisma.invoice.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      amountPaid: true,
      amountDue: true,
      currency: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      createdAt: true,
    },
  });

  return JSON.stringify({
    found: true,
    invoices: invoices.map((i) => ({
      ...i,
      amountPaid: `${(i.amountPaid / 100).toFixed(2)} ${i.currency.toUpperCase()}`,
      amountDue: `${(i.amountDue / 100).toFixed(2)} ${i.currency.toUpperCase()}`,
      periodStart: i.periodStart.toISOString().slice(0, 10),
      periodEnd: i.periodEnd.toISOString().slice(0, 10),
      createdAt: i.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

async function lookupUserPaymentEvents(email: string, limit: number): Promise<string> {
  const events = await prisma.paymentEvent.findMany({
    where: { email: email.toLowerCase() },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, event: true, plan: true, amount: true, createdAt: true },
  });

  return JSON.stringify({
    totalEvents: events.length,
    events: events.map((e) => ({
      ...e,
      amount: e.amount ? `${(e.amount / 100).toFixed(2)} USD` : null,
      createdAt: e.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

async function getKnownIssues(area?: string): Promise<string> {
  const where: Record<string, unknown> = {
    status: { in: ['open', 'in-progress'] },
  };
  if (area) where.area = area;

  const issues = await prisma.issue.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      title: true,
      area: true,
      status: true,
      priority: true,
      createdAt: true,
    },
  });

  return JSON.stringify({
    knownIssueCount: issues.length,
    issues: issues.map((i) => ({
      ...i,
      createdAt: i.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

async function getAnnouncements(): Promise<string> {
  const now = new Date();
  const announcements = await prisma.announcement.findMany({
    where: {
      isActive: true,
      OR: [{ startDate: null }, { startDate: { lte: now } }],
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      title: true,
      content: true,
      type: true,
      audience: true,
      createdAt: true,
    },
  });

  return JSON.stringify({
    count: announcements.length,
    announcements: announcements.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

async function lookupEmailHistory(email: string, limit: number): Promise<string> {
  const emails = await prisma.emailMessage.findMany({
    where: { from: email.toLowerCase() },
    orderBy: { receivedAt: 'desc' },
    take: limit,
    select: {
      id: true,
      subject: true,
      classification: true,
      status: true,
      receivedAt: true,
      bodyText: true,
    },
  });

  // Also check for our replies
  const drafts = await prisma.emailDraft.findMany({
    where: {
      emailMessage: { from: email.toLowerCase() },
      status: 'sent',
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      emailMessageId: true,
      draftText: true,
      createdAt: true,
    },
  });

  return JSON.stringify({
    previousEmails: emails.map((e) => ({
      id: e.id,
      subject: e.subject,
      classification: e.classification,
      status: e.status,
      receivedAt: e.receivedAt.toISOString().slice(0, 10),
      bodyPreview: e.bodyText.slice(0, 300),
    })),
    sentReplies: drafts.map((d) => ({
      emailMessageId: d.emailMessageId,
      replyPreview: d.draftText.slice(0, 300),
      sentAt: d.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

async function getFeatureRoadmap(status?: string): Promise<string> {
  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else {
    where.status = { in: ['planned', 'in-progress'] };
  }

  const ideas = await prisma.idea.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 15,
    include: {
      _count: { select: { votes: true } },
    },
  });

  return JSON.stringify({
    count: ideas.length,
    ideas: ideas.map((i) => ({
      title: i.title,
      description: i.description.slice(0, 200),
      category: i.category,
      status: i.status,
      votes: i._count.votes,
      createdAt: i.createdAt.toISOString().slice(0, 10),
    })),
  }, null, 2);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function itemTypeName(type: number | null): string {
  switch (type) {
    case 0: return 'host';
    case 1: return 'identity';
    case 2: return 'group';
    case 3: return 'snippet';
    case 4: return 'port_forward';
    default: return `type_${type ?? 'unknown'}`;
  }
}
