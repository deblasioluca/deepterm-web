/**
 * sync-org-plans.ts
 * Shared utility to sync an organization's plan to all its confirmed members.
 * Called from:
 *   - Stripe webhook (on subscription create/update/delete)
 *   - Member confirm route (when a new member joins an org)
 *   - Member remove route (to clear org plan from removed member)
 */

import { prisma } from '@/lib/prisma';

/**
 * Sync the organization's plan to all confirmed members' User records.
 * Sets subscriptionScope to 'organization' when org has an active plan,
 * or clears it to 'none' when the org plan is downgraded to free.
 */
export async function syncOrgMemberPlans(
  organizationId: string,
  plan: string,
  stripeCustomerId: string | null,
  stripeSubscriptionId: string | null
) {
  try {
    const orgMembers = await prisma.organizationUser.findMany({
      where: { organizationId, status: 'confirmed' },
      include: { user: { include: { webUser: true } } },
    });
    const webUserIds = orgMembers
      .map((m) => m.user?.webUser?.id)
      .filter((id): id is string => !!id);

    if (webUserIds.length > 0) {
      const isOrgActive = plan !== 'free';
      await prisma.user.updateMany({
        where: { id: { in: webUserIds } },
        data: {
          plan,
          stripeSubscriptionId,
          subscriptionScope: isOrgActive ? 'organization' : 'none',
        },
      });
    }
  } catch (err) {
    console.error('[syncOrgMemberPlans] Failed:', err);
  }
}

/**
 * Sync a single member's plan when they join an organization.
 * Looks up the org's current plan and applies it to the member's User record.
 */
export async function syncNewMemberPlan(
  organizationId: string,
  userId: string
) {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        plan: true,
        stripeCustomerId: true,
        stripeSubscriptionId: true,
        subscriptionStatus: true,
      },
    });

    if (!org) return;

    const isActive = org.subscriptionStatus === 'active'
      || org.subscriptionStatus === 'trialing';
    const plan = isActive ? (org.plan || 'free') : 'free';

    // Find the web User linked to this ZKUser
    const zkUser = await prisma.zKUser.findUnique({
      where: { id: userId },
      include: { webUser: true },
    });

    if (!zkUser?.webUser) return;

    // Only upgrade — don't downgrade a user who has a better individual plan
    const webUser = zkUser.webUser;
    const planRank: Record<string, number> = {
      free: 0, starter: 0, pro: 1, team: 2, business: 3, enterprise: 4,
    };
    const currentRank = planRank[webUser.plan] ?? 0;
    const orgRank = planRank[plan] ?? 0;

    if (plan !== 'free') {
      // Only upgrade the plan if org plan is higher than current;
      // always set subscriptionScope to 'organization' so the user
      // is tracked as an org member for expiry logic.
      await prisma.user.update({
        where: { id: webUser.id },
        data: {
          plan: orgRank > currentRank ? plan : webUser.plan,
          stripeSubscriptionId: org.stripeSubscriptionId,
          subscriptionScope: 'organization',
        },
      });
    }

    console.log(`[syncNewMemberPlan] userId=${userId} org plan=${plan} applied`);
  } catch (err) {
    console.error('[syncNewMemberPlan] Failed:', err);
  }
}

/**
 * Clear org plan from a removed member's User record.
 * Only clears if their subscriptionScope is 'organization'.
 * If they have an individual subscription, that takes over.
 */
export async function clearRemovedMemberPlan(userId: string) {
  try {
    const zkUser = await prisma.zKUser.findUnique({
      where: { id: userId },
      include: { webUser: true },
    });

    if (!zkUser?.webUser) return;

    const webUser = zkUser.webUser;

    // Only clear if the user's plan was from an org subscription
    if (webUser.subscriptionScope === 'organization') {
      // Check if user has an active individual subscription to fall back to
      const hasIndividualSub = webUser.subscriptionSource === 'appstore'
        && webUser.subscriptionExpiresAt
        && webUser.subscriptionExpiresAt > new Date();

      // Look up the Apple product to determine fallback plan tier
      let fallbackPlan = 'pro'; // default for Apple IAP
      if (hasIndividualSub && zkUser.appleProductId) {
        // Map Apple product IDs to plan tiers if needed
        // Currently all Apple IAP products map to 'pro'
        fallbackPlan = 'pro';
      }

      await prisma.user.update({
        where: { id: webUser.id },
        data: {
          plan: hasIndividualSub ? fallbackPlan : 'free',
          subscriptionScope: hasIndividualSub ? 'individual' : 'none',
          stripeSubscriptionId: null,
        },
      });

      console.log(`[clearRemovedMemberPlan] userId=${userId} cleared org plan, fallback=${hasIndividualSub ? 'individual' : 'free'}`);
    }
  } catch (err) {
    console.error('[clearRemovedMemberPlan] Failed:', err);
  }
}
