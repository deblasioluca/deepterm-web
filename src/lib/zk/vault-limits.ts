/**
 * vault-limits.ts
 * Server-side vault item limit enforcement.
 * 
 * The server enforces total maxVaultItems as a safety cap.
 * The app enforces per-type limits (maxHosts, maxKeys, maxIdentities)
 * since only the app can decrypt and inspect item types.
 *
 * Limits are scoped by vault owner:
 *   - Personal vault items → user's individual plan limits
 *   - Org vault items → organization's plan limits
 */

import { prisma } from '@/lib/prisma';
import { getLimitsForPlan } from '@/lib/plan-limits';

interface VaultLimitCheck {
  allowed: boolean;
  remaining: number;       // -1 = unlimited
  currentCount: number;
  maxVaultItems: number;   // -1 = unlimited
  plan: string;
  scope: 'personal' | 'organization';
}

/**
 * Check if a user can create more vault items.
 * Accepts an optional vaultId to scope limits by vault owner.
 * Returns the check result — caller decides what to do.
 */
export async function checkVaultItemLimit(
  userId: string,
  vaultId?: string,
): Promise<VaultLimitCheck> {
  // Get user and look up organization for plan info
  const zkUser = await prisma.zKUser.findUnique({
    where: { id: userId },
    include: { webUser: true },
  });

  if (!zkUser) {
    return {
      allowed: false,
      remaining: 0,
      currentCount: 0,
      maxVaultItems: 0,
      plan: 'starter',
      scope: 'personal',
    };
  }

  // Determine vault scope: is this an org vault or personal vault?
  let scope: 'personal' | 'organization' = 'personal';
  let vaultOrgId: string | null = null;

  if (vaultId) {
    const vault = await prisma.zKVault.findUnique({
      where: { id: vaultId },
      select: { organizationId: true, userId: true },
    });
    if (vault?.organizationId) {
      scope = 'organization';
      vaultOrgId = vault.organizationId;
    }
  }

  let plan = 'starter';

  if (scope === 'organization' && vaultOrgId) {
    // Org vault → use the org's plan for limits
    const org = await prisma.organization.findUnique({
      where: { id: vaultOrgId },
      select: { plan: true, subscriptionStatus: true },
    });
    if (org) {
      const isActive = org.subscriptionStatus === 'active'
        || org.subscriptionStatus === 'trialing';
      const orgPlan = isActive ? (org.plan || 'starter') : 'starter';
      plan = orgPlan === 'free' ? 'starter' : orgPlan;
    }
  } else {
    // Personal vault → use the user's effective plan (max of individual + org)
    // Look up ALL user's organizations — pick the one with the best plan
    const memberships = await prisma.organizationUser.findMany({
      where: { userId, status: { in: ['confirmed', 'active'] } },
      include: { organization: true },
    });

    const planRank: Record<string, number> = {
      starter: 0, free: 0, pro: 1, team: 2, business: 3, enterprise: 4,
    };
    let bestPlan = 'starter';

    // Check individual plan from web User
    if (zkUser.webUser) {
      const userPlan = zkUser.webUser.plan === 'free' ? 'starter' : zkUser.webUser.plan;
      if ((planRank[userPlan] ?? 0) > (planRank[bestPlan] ?? 0)) {
        bestPlan = userPlan;
      }
    }

    // Check org plans
    for (const m of memberships) {
      const o = m.organization;
      const active = o.subscriptionStatus === 'active'
        || o.subscriptionStatus === 'trialing';
      const p = active ? (o.plan || 'starter') : 'starter';
      const normalized = p === 'free' ? 'starter' : p;
      if ((planRank[normalized] ?? 0) > (planRank[bestPlan] ?? 0)) {
        bestPlan = normalized;
      }
    }
    plan = bestPlan;
  }

  console.log('[vault-limits] userId:', userId, 'vaultId:', vaultId,
    'scope:', scope, 'effectivePlan:', plan);

  const limits = getLimitsForPlan(plan);

  // Unlimited
  if (limits.maxVaultItems === -1) {
    return {
      allowed: true,
      remaining: -1,
      currentCount: 0, // Not computed for unlimited
      maxVaultItems: -1,
      plan,
      scope,
    };
  }

  // Count existing non-deleted items scoped by owner:
  //   - Personal vault → count ALL user's items (limit is per-user total)
  //   - Org vault → count all items across org's vaults (limit is per-org total)
  const countWhere = scope === 'organization' && vaultOrgId
    ? { vault: { organizationId: vaultOrgId }, deletedAt: null }
    : { userId, deletedAt: null };
  const currentCount = await prisma.zKVaultItem.count({ where: countWhere });

  const remaining = limits.maxVaultItems - currentCount;

  return {
    allowed: remaining > 0,
    remaining,
    currentCount,
    maxVaultItems: limits.maxVaultItems,
    plan,
    scope,
  };
}
