/**
 * vault-limits.ts
 * Server-side vault item limit enforcement.
 * 
 * The server enforces total maxVaultItems as a safety cap.
 * The app enforces per-type limits (maxHosts, maxKeys, maxIdentities)
 * since only the app can decrypt and inspect item types.
 */

import { prisma } from '@/lib/prisma';
import { getLimitsForPlan } from '@/lib/plan-limits';

interface VaultLimitCheck {
  allowed: boolean;
  remaining: number;       // -1 = unlimited
  currentCount: number;
  maxVaultItems: number;   // -1 = unlimited
  plan: string;
}

/**
 * Check if a user can create more vault items.
 * Returns the check result — caller decides what to do.
 */
export async function checkVaultItemLimit(userId: string): Promise<VaultLimitCheck> {
  // Get user and look up organization for plan info
  const zkUser = await prisma.zKUser.findUnique({
    where: { id: userId },
  });

  if (!zkUser) {
    return {
      allowed: false,
      remaining: 0,
      currentCount: 0,
      maxVaultItems: 0,
      plan: 'starter',
    };
  }

  // Look up ALL user's organizations — pick the one with the best plan
  const memberships = await prisma.organizationUser.findMany({
    where: { userId, status: 'confirmed' },
    include: { organization: true },
  });

  // Find the org with the most permissive active plan
  const planRank: Record<string, number> = {
    starter: 0, free: 0, pro: 1, team: 2, business: 3, enterprise: 4,
  };
  let bestOrg: typeof memberships[0]['organization'] | null = null;
  let bestPlan = 'starter';
  for (const m of memberships) {
    const o = m.organization;
    const active = o.subscriptionStatus === 'active'
      || o.subscriptionStatus === 'trialing';
    const p = active ? (o.plan || 'starter') : 'starter';
    const normalized = p === 'free' ? 'starter' : p;
    if ((planRank[normalized] ?? 0) > (planRank[bestPlan] ?? 0)) {
      bestPlan = normalized;
      bestOrg = o;
    }
  }
  const org = bestOrg ?? memberships[0]?.organization ?? null;
  const plan = bestPlan;

  console.log('[vault-limits] userId:', userId,
    'org:', org ? JSON.stringify({ plan: org.plan, status: org.subscriptionStatus }) : 'none',
    'effectivePlan:', plan);

  const limits = getLimitsForPlan(plan);

  // Unlimited
  if (limits.maxVaultItems === -1) {
    return {
      allowed: true,
      remaining: -1,
      currentCount: 0, // Not computed for unlimited
      maxVaultItems: -1,
      plan,
    };
  }

  // Count existing non-deleted items
  const currentCount = await prisma.zKVaultItem.count({
    where: {
      userId,
      deletedAt: null,
    },
  });

  const remaining = limits.maxVaultItems - currentCount;

  return {
    allowed: remaining > 0,
    remaining,
    currentCount,
    maxVaultItems: limits.maxVaultItems,
    plan,
  };
}
