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
  // Get user with team/plan info
  const zkUser = await prisma.zKUser.findUnique({
    where: { id: userId },
    include: {
      webUser: {
        select: {
          team: {
            select: {
              plan: true,
              subscriptionStatus: true,
            },
          },
        },
      },
    },
  });

  // Determine effective plan
  const isActive = zkUser?.webUser?.team?.subscriptionStatus === 'active'
    || zkUser?.webUser?.team?.subscriptionStatus === 'trialing';
  const plan = isActive
    ? (zkUser?.webUser?.team?.plan || 'starter')
    : 'starter';

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
