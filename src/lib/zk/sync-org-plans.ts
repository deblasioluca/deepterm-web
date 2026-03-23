/**
 * sync-org-plans.ts
 * Shared utility to sync an organization's plan to all its confirmed members.
 * Called from:
 *   - Stripe webhook (on subscription create/update/delete)
 *   - Member confirm route (when a new member joins an org)
 *   - Member remove route (to clear org plan from removed member)
 */

import { prisma } from '@/lib/prisma';
import { getApplePlan } from './apple-plan';

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
      const planRank: Record<string, number> = {
        free: 0, starter: 0, pro: 1, team: 2, business: 3, enterprise: 4,
      };
      const isOrgActive = plan !== 'free';
      if (isOrgActive) {
        // Org has an active plan — sync to members with scope-aware logic:
        //   - If member's current plan came from an org (scope='organization'), always
        //     update to the new org plan (handles org tier downgrades like team→pro).
        //   - If member has a higher individual plan (scope='individual'), keep their
        //     plan and scope so Apple EXPIRED handler works correctly.
        const orgRank = planRank[plan] ?? 0;
        const webUsers = await prisma.user.findMany({
          where: { id: { in: webUserIds } },
          select: { id: true, plan: true, subscriptionScope: true },
        });
        for (const wu of webUsers) {
          const currentRank = planRank[wu.plan] ?? 0;
          const isOrgScoped = wu.subscriptionScope === 'organization';
          // For org-scoped members: always apply the org plan (handles downgrades).
          // For individual/none-scoped members: only upgrade, never downgrade.
          const newPlan = isOrgScoped
            ? plan
            : (orgRank > currentRank ? plan : wu.plan);
          const newScope = isOrgScoped || orgRank > currentRank
            ? 'organization'
            : wu.subscriptionScope ?? 'none';
          const applyingOrgPlan = isOrgScoped || orgRank > currentRank;
          await prisma.user.update({
            where: { id: wu.id },
            data: {
              plan: newPlan,
              subscriptionScope: newScope,
              // Only overwrite stripeSubscriptionId when the org plan is actually applied.
              // For individual-scoped members keeping their higher plan, preserve their
              // existing stripeSubscriptionId to avoid corrupting subscriptionSource detection.
              ...(applyingOrgPlan ? { stripeSubscriptionId } : {}),
            },
          });
        }
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
            zkUser: { select: { id: true, appleProductId: true } },
          },
        });
        const now = new Date();
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
                plan: hasIndividualSub
                  ? getApplePlan(wu.zkUser?.appleProductId ?? '')
                  : 'free',
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
      // Only upgrade the plan if org plan is higher than current individual plan.
      // Preserve subscriptionScope='individual' when user keeps their higher plan,
      // so Apple EXPIRED handler correctly handles their individual sub lifecycle.
      const shouldUpgrade = orgRank > currentRank;
      await prisma.user.update({
        where: { id: webUser.id },
        data: {
          plan: shouldUpgrade ? plan : webUser.plan,
          subscriptionScope: shouldUpgrade ? 'organization' : webUser.subscriptionScope,
          // Only overwrite stripeSubscriptionId when the org plan actually wins.
          // Otherwise we'd corrupt an Apple IAP user's subscriptionSource detection
          // (stripeSubscriptionId present → treated as Stripe instead of appstore).
          ...(shouldUpgrade ? { stripeSubscriptionId: org.stripeSubscriptionId } : {}),
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
      select: { id: true, appleProductId: true, webUser: true },
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
            plan: hasIndividualSub
              ? getApplePlan(zkUser.appleProductId ?? '')
              : 'free',
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
