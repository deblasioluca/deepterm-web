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
      if (isOrgActive) {
        // Org has an active plan — upgrade all members
        await prisma.user.updateMany({
          where: { id: { in: webUserIds } },
          data: {
            plan,
            stripeSubscriptionId,
            subscriptionScope: 'organization',
          },
        });
      } else {
        // Org plan downgraded to free — check each member for other org
        // memberships and individual subs before resetting
        const webUsers = await prisma.user.findMany({
          where: { id: { in: webUserIds } },
          select: {
            id: true,
            subscriptionSource: true,
            subscriptionExpiresAt: true,
            subscriptionScope: true,
            zkUser: { select: { id: true } },
          },
        });
        const now = new Date();
        const planRank: Record<string, number> = {
          free: 0, starter: 0, pro: 1, team: 2, business: 3, enterprise: 4,
        };
        for (const wu of webUsers) {
          // Check if user belongs to another org with an active paid plan
          let bestOtherOrgPlan: string | null = null;
          let bestOtherOrgSubId: string | null = null;
          if (wu.zkUser) {
            const otherOrgMemberships = await prisma.organizationUser.findMany({
              where: {
                userId: wu.zkUser.id,
                status: 'confirmed',
                organizationId: { not: organizationId },
              },
              include: { organization: true },
            });
            for (const m of otherOrgMemberships) {
              const o = m.organization;
              const active = o.subscriptionStatus === 'active'
                || o.subscriptionStatus === 'trialing';
              if (active && o.plan && o.plan !== 'free') {
                if (!bestOtherOrgPlan || (planRank[o.plan] ?? 0) > (planRank[bestOtherOrgPlan] ?? 0)) {
                  bestOtherOrgPlan = o.plan;
                  bestOtherOrgSubId = o.stripeSubscriptionId;
                }
              }
            }
          }

          if (bestOtherOrgPlan) {
            // User has another org with an active plan — use that
            await prisma.user.update({
              where: { id: wu.id },
              data: {
                plan: bestOtherOrgPlan,
                stripeSubscriptionId: bestOtherOrgSubId,
                subscriptionScope: 'organization',
              },
            });
          } else {
            // No other org — fall back to individual sub or free
            const hasIndividualSub = wu.subscriptionSource === 'appstore'
              && wu.subscriptionExpiresAt
              && wu.subscriptionExpiresAt > now;
            await prisma.user.update({
              where: { id: wu.id },
              data: {
                plan: hasIndividualSub ? 'pro' : 'free',
                stripeSubscriptionId: null,
                subscriptionScope: hasIndividualSub ? 'individual' : 'none',
              },
            });
          }
        }
      }
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
      // Check if user belongs to another org with an active paid plan
      const planRank: Record<string, number> = {
        free: 0, starter: 0, pro: 1, team: 2, business: 3, enterprise: 4,
      };
      const otherOrgMemberships = await prisma.organizationUser.findMany({
        where: {
          userId,
          status: 'confirmed',
        },
        include: { organization: true },
      });
      let bestOtherOrgPlan: string | null = null;
      let bestOtherOrgSubId: string | null = null;
      for (const m of otherOrgMemberships) {
        const o = m.organization;
        const active = o.subscriptionStatus === 'active'
          || o.subscriptionStatus === 'trialing';
        if (active && o.plan && o.plan !== 'free') {
          if (!bestOtherOrgPlan || (planRank[o.plan] ?? 0) > (planRank[bestOtherOrgPlan] ?? 0)) {
            bestOtherOrgPlan = o.plan;
            bestOtherOrgSubId = o.stripeSubscriptionId;
          }
        }
      }

      if (bestOtherOrgPlan) {
        // User has another org with an active plan — use that
        await prisma.user.update({
          where: { id: webUser.id },
          data: {
            plan: bestOtherOrgPlan,
            stripeSubscriptionId: bestOtherOrgSubId,
            subscriptionScope: 'organization',
          },
        });
        console.log(`[clearRemovedMemberPlan] userId=${userId} fell back to other org plan=${bestOtherOrgPlan}`);
      } else {
        // No other org — fall back to individual sub or free
        const hasIndividualSub = webUser.subscriptionSource === 'appstore'
          && webUser.subscriptionExpiresAt
          && webUser.subscriptionExpiresAt > new Date();

        await prisma.user.update({
          where: { id: webUser.id },
          data: {
            plan: hasIndividualSub ? 'pro' : 'free',
            subscriptionScope: hasIndividualSub ? 'individual' : 'none',
            stripeSubscriptionId: null,
          },
        });
        console.log(`[clearRemovedMemberPlan] userId=${userId} cleared org plan, fallback=${hasIndividualSub ? 'individual' : 'free'}`);
      }
    }
  } catch (err) {
    console.error('[clearRemovedMemberPlan] Failed:', err);
  }
}
