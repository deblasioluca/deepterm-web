/**
 * DeepTerm MCP Server — Model Context Protocol server for end-users.
 *
 * Allows LLM clients (Claude Desktop, Cursor, etc.) to query the user's
 * DeepTerm data: vaults, subscription, payments, issues, ideas, notifications.
 *
 * Auth: Bearer token (ZK JWT access token) passed via MCP_API_KEY or
 * custom header.  Each request creates a stateless server scoped to the
 * authenticated user.
 *
 * Transport: Streamable HTTP (Web Standards) — works with Next.js App Router.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// ── Tool registration ────────────────────────────

export function createMcpServer(userId: string, userEmail: string) {
  const server = new McpServer(
    { name: 'deepterm', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  // ── get_profile ────────────────────────────────
  server.registerTool(
    'get_profile',
    {
      description: 'Get your DeepTerm account profile, subscription status, and linked devices.',
      inputSchema: {},
    },
    async () => {
      const user = await prisma.zKUser.findUnique({
        where: { id: userId },
        include: {
          devices: { select: { id: true, name: true, deviceType: true, lastActive: true } },
          webUser: {
            select: {
              id: true, name: true, email: true, plan: true,
              subscriptionSource: true, subscriptionExpiresAt: true,
              twoFactorEnabled: true, createdAt: true,
              team: { select: { id: true, name: true, plan: true, seats: true, subscriptionStatus: true, currentPeriodEnd: true } },
            },
          },
        },
      });

      if (!user) {
        return { content: [{ type: 'text' as const, text: 'User not found.' }] };
      }

      const profile = {
        vaultAccount: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
          kdfType: user.kdfType,
          kdfIterations: user.kdfIterations,
          createdAt: user.createdAt,
        },
        webAccount: user.webUser ? {
          name: user.webUser.name,
          email: user.webUser.email,
          plan: user.webUser.plan,
          subscriptionSource: user.webUser.subscriptionSource,
          subscriptionExpiresAt: user.webUser.subscriptionExpiresAt,
          twoFactorEnabled: user.webUser.twoFactorEnabled,
          createdAt: user.webUser.createdAt,
        } : null,
        team: user.webUser?.team ?? null,
        devices: user.devices,
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(profile, null, 2) }] };
    },
  );

  // ── list_vaults ────────────────────────────────
  server.registerTool(
    'list_vaults',
    {
      description: 'List all vaults you have access to, with item counts.',
      inputSchema: {},
    },
    async () => {
      const vaults = await prisma.zKVault.findMany({
        where: { userId },
        select: {
          id: true, name: true, isDefault: true, createdAt: true, updatedAt: true,
          items: { select: { id: true, type: true, deletedAt: true } },
        },
      });

      const result = vaults.map(v => ({
        id: v.id,
        name: v.name,
        isDefault: v.isDefault,
        createdAt: v.createdAt,
        updatedAt: v.updatedAt,
        totalItems: v.items.filter(i => !i.deletedAt).length,
        deletedItems: v.items.filter(i => i.deletedAt).length,
        itemsByType: v.items.filter(i => !i.deletedAt).reduce((acc, i) => {
          const typeName = itemTypeName(i.type);
          acc[typeName] = (acc[typeName] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── vault_summary ──────────────────────────────
  server.registerTool(
    'vault_summary',
    {
      description: 'Get a summary of vault items: counts by type, recently modified, recently deleted. Does NOT return encrypted data.',
      inputSchema: {
        vault_id: z.string().optional().describe('Vault ID to inspect. Omit to summarize all vaults.'),
      },
    },
    async ({ vault_id }) => {
      const where = vault_id
        ? { vaultId: vault_id, userId }
        : { userId };

      const items = await prisma.zKVaultItem.findMany({
        where,
        select: { id: true, type: true, vaultId: true, revisionDate: true, deletedAt: true, createdAt: true },
        orderBy: { revisionDate: 'desc' },
      });

      const active = items.filter(i => !i.deletedAt);
      const deleted = items.filter(i => i.deletedAt);

      const byType: Record<string, number> = {};
      for (const i of active) {
        const t = itemTypeName(i.type);
        byType[t] = (byType[t] || 0) + 1;
      }

      const summary = {
        totalActive: active.length,
        totalDeleted: deleted.length,
        byType,
        recentlyModified: active.slice(0, 5).map(i => ({
          id: i.id, type: itemTypeName(i.type), vaultId: i.vaultId, revisionDate: i.revisionDate,
        })),
        recentlyDeleted: deleted.slice(0, 5).map(i => ({
          id: i.id, type: itemTypeName(i.type), deletedAt: i.deletedAt,
        })),
      };

      return { content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }] };
    },
  );

  // ── get_subscription ───────────────────────────
  server.registerTool(
    'get_subscription',
    {
      description: 'Get your current subscription plan, billing period, and payment method.',
      inputSchema: {},
    },
    async () => {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: userId },
        select: {
          webUser: {
            select: {
              plan: true, subscriptionSource: true, subscriptionExpiresAt: true,
              team: {
                select: {
                  plan: true, subscriptionStatus: true, seats: true,
                  currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
                  paymentMethods: {
                    where: { isDefault: true },
                    select: { type: true, brand: true, last4: true, expMonth: true, expYear: true },
                    take: 1,
                  },
                },
              },
            },
          },
          appleProductId: true, appleExpiresDate: true, applePurchaseDate: true,
        },
      });

      if (!zkUser) {
        return { content: [{ type: 'text' as const, text: 'User not found.' }] };
      }

      const sub: Record<string, unknown> = {};

      if (zkUser.webUser) {
        sub.plan = zkUser.webUser.plan;
        sub.source = zkUser.webUser.subscriptionSource;
        sub.expiresAt = zkUser.webUser.subscriptionExpiresAt;
        if (zkUser.webUser.team) {
          const t = zkUser.webUser.team;
          sub.team = {
            plan: t.plan, status: t.subscriptionStatus, seats: t.seats,
            periodStart: t.currentPeriodStart, periodEnd: t.currentPeriodEnd,
            cancelAtPeriodEnd: t.cancelAtPeriodEnd,
            paymentMethod: t.paymentMethods[0] ?? null,
          };
        }
      }

      if (zkUser.appleProductId) {
        sub.apple = {
          productId: zkUser.appleProductId,
          purchaseDate: zkUser.applePurchaseDate,
          expiresDate: zkUser.appleExpiresDate,
        };
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(sub, null, 2) }] };
    },
  );

  // ── list_invoices ──────────────────────────────
  server.registerTool(
    'list_invoices',
    {
      description: 'List your billing invoices (most recent first).',
      inputSchema: {
        limit: z.number().min(1).max(50).optional().default(10).describe('Max invoices to return (default 10).'),
      },
    },
    async ({ limit }) => {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: userId },
        select: { webUser: { select: { team: { select: { id: true } } } } },
      });

      const teamId = zkUser?.webUser?.team?.id;
      if (!teamId) {
        return { content: [{ type: 'text' as const, text: 'No team/billing account found.' }] };
      }

      const invoices = await prisma.invoice.findMany({
        where: { teamId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, amountPaid: true, amountDue: true, currency: true,
          status: true, periodStart: true, periodEnd: true, createdAt: true,
        },
      });

      const formatted = invoices.map(i => ({
        ...i,
        amountPaid: `${(i.amountPaid / 100).toFixed(2)} ${i.currency.toUpperCase()}`,
        amountDue: `${(i.amountDue / 100).toFixed(2)} ${i.currency.toUpperCase()}`,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  // ── list_payment_events ────────────────────────
  server.registerTool(
    'list_payment_events',
    {
      description: 'List your recent payment events (purchases, renewals, cancellations).',
      inputSchema: {
        limit: z.number().min(1).max(50).optional().default(10).describe('Max events to return.'),
      },
    },
    async ({ limit }) => {
      const events = await prisma.paymentEvent.findMany({
        where: { email: userEmail },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, event: true, plan: true, amount: true, createdAt: true },
      });

      const formatted = events.map(e => ({
        ...e,
        amount: e.amount ? `${(e.amount / 100).toFixed(2)} USD` : null,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  // ── list_issues ────────────────────────────────
  server.registerTool(
    'list_issues',
    {
      description: 'List your submitted bug reports and support tickets.',
      inputSchema: {
        status: z.enum(['open', 'in-progress', 'resolved', 'closed']).optional().describe('Filter by status.'),
        limit: z.number().min(1).max(50).optional().default(20).describe('Max results.'),
      },
    },
    async ({ status, limit }) => {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: userId },
        select: { webUserId: true },
      });

      if (!zkUser?.webUserId) {
        return { content: [{ type: 'text' as const, text: 'No linked web account.' }] };
      }

      const where: Record<string, unknown> = { userId: zkUser.webUserId };
      if (status) where.status = status;

      const issues = await prisma.issue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, title: true, area: true, status: true, priority: true,
          createdAt: true, updatedAt: true, firstResponseAt: true,
        },
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(issues, null, 2) }] };
    },
  );

  // ── get_issue ──────────────────────────────────
  server.registerTool(
    'get_issue',
    {
      description: 'Get details of a specific issue you submitted, including updates.',
      inputSchema: {
        issue_id: z.string().describe('The issue ID.'),
      },
    },
    async ({ issue_id }) => {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: userId },
        select: { webUserId: true },
      });

      if (!zkUser?.webUserId) {
        return { content: [{ type: 'text' as const, text: 'No linked web account.' }] };
      }

      const issue = await prisma.issue.findFirst({
        where: { id: issue_id, userId: zkUser.webUserId },
        include: {
          updates: {
            where: { visibility: 'public' },
            orderBy: { createdAt: 'asc' },
            select: { authorType: true, authorEmail: true, message: true, status: true, createdAt: true },
          },
          attachments: {
            select: { id: true, kind: true, originalFilename: true, sizeBytes: true, createdAt: true },
          },
        },
      });

      if (!issue) {
        return { content: [{ type: 'text' as const, text: 'Issue not found or access denied.' }] };
      }

      const { userId: _uid, ...safe } = issue;
      return { content: [{ type: 'text' as const, text: JSON.stringify(safe, null, 2) }] };
    },
  );

  // ── list_ideas ─────────────────────────────────
  server.registerTool(
    'list_ideas',
    {
      description: 'List feature ideas from the voting board, with vote counts.',
      inputSchema: {
        status: z.enum(['consideration', 'planned', 'in-progress', 'launched']).optional().describe('Filter by status.'),
        limit: z.number().min(1).max(50).optional().default(20).describe('Max results.'),
      },
    },
    async ({ status, limit }) => {
      const where: Record<string, unknown> = {};
      if (status) where.status = status;

      const ideas = await prisma.idea.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          _count: { select: { votes: true } },
        },
      });

      const result = ideas.map(i => ({
        id: i.id,
        title: i.title,
        description: i.description.slice(0, 200),
        category: i.category,
        status: i.status,
        votes: i._count.votes,
        createdAt: i.createdAt,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    },
  );

  // ── list_notifications ─────────────────────────
  server.registerTool(
    'list_notifications',
    {
      description: 'List your notifications (status updates, admin replies, announcements).',
      inputSchema: {
        unread_only: z.boolean().optional().default(false).describe('Only show unread notifications.'),
        limit: z.number().min(1).max(50).optional().default(20).describe('Max results.'),
      },
    },
    async ({ unread_only, limit }) => {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id: userId },
        select: { webUserId: true },
      });

      if (!zkUser?.webUserId) {
        return { content: [{ type: 'text' as const, text: 'No linked web account.' }] };
      }

      const where: Record<string, unknown> = { userId: zkUser.webUserId };
      if (unread_only) where.isRead = false;

      const notifs = await prisma.userNotification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true, type: true, title: true, message: true,
          linkUrl: true, isRead: true, createdAt: true,
        },
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(notifs, null, 2) }] };
    },
  );

  // ── list_announcements ─────────────────────────
  server.registerTool(
    'list_announcements',
    {
      description: 'List current product announcements and updates.',
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      const announcements = await prisma.announcement.findMany({
        where: {
          isActive: true,
          OR: [
            { startDate: null },
            { startDate: { lte: now } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, title: true, content: true, type: true,
          audience: true, createdAt: true,
        },
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(announcements, null, 2) }] };
    },
  );

  // ── list_subscription_plans ────────────────────
  server.registerTool(
    'list_subscription_plans',
    {
      description: 'List available DeepTerm subscription plans and pricing.',
      inputSchema: {},
    },
    async () => {
      const plans = await prisma.subscriptionOffering.findMany({
        where: { isActive: true, stage: 'live' },
        orderBy: { priceCents: 'asc' },
        select: {
          key: true, name: true, description: true,
          interval: true, priceCents: true, currency: true,
        },
      });

      const formatted = plans.map(p => ({
        ...p,
        price: `${(p.priceCents / 100).toFixed(2)} ${p.currency.toUpperCase()}/${p.interval}`,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(formatted, null, 2) }] };
    },
  );

  // ── list_devices ───────────────────────────────
  server.registerTool(
    'list_devices',
    {
      description: 'List your registered devices.',
      inputSchema: {},
    },
    async () => {
      const devices = await prisma.device.findMany({
        where: { userId },
        orderBy: { lastActive: 'desc' },
        select: { id: true, name: true, deviceType: true, lastActive: true, createdAt: true },
      });

      return { content: [{ type: 'text' as const, text: JSON.stringify(devices, null, 2) }] };
    },
  );

  return server;
}

// ── Helpers ──────────────────────────────────────

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

// ── Transport handler for Next.js App Router ─────

export async function handleMcpRequest(
  request: Request,
  userId: string,
  userEmail: string,
): Promise<Response> {
  const server = createMcpServer(userId, userEmail);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,      // return JSON instead of SSE
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } finally {
    await transport.close();
    await server.close();
  }
}
