import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';
import { getLimitsForPlan, getFeaturesForPlan } from '@/lib/plan-limits';
import { getApplePlan } from '@/lib/zk/apple-plan';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/accounts/license
 * Get the user's license/subscription status
 * Used by the DeepTerm app to determine feature availability
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    // Get the ZK user with linked web user and Apple IAP info
    const zkUser = await prisma.zKUser.findUnique({
      where: { id: auth.userId },
      include: {
        webUser: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!zkUser) {
      return errorResponse('User not found', 404);
    }

    const now = new Date();

    // Look up user's organization for billing info
    const membership = await prisma.organizationUser.findFirst({
      where: { userId: zkUser.id, status: 'confirmed' },
      include: { organization: true },
    });
    const org = membership?.organization;

    // Check Stripe subscription (web purchase)
    const stripeActive = org?.subscriptionStatus === 'active' || org?.subscriptionStatus === 'trialing';
    const stripePastDue = org?.subscriptionStatus === 'past_due';
    const stripePeriodEnd = org?.currentPeriodEnd;
    const stripeWithinPeriod = stripePeriodEnd ? stripePeriodEnd > now : false;
    const stripeValid = stripeActive || (stripeWithinPeriod && !stripePastDue);

    // Check Apple IAP subscription
    const appleValid = zkUser.appleExpiresDate ? zkUser.appleExpiresDate > now : false;
    const applePlan = zkUser.appleProductId ? getApplePlan(zkUser.appleProductId) : null;

    // Valid license: either Stripe OR Apple IAP is valid
    const hasValidLicense = stripeValid || appleValid;
    
    // Determine effective plan (prefer higher tier)
    // Organization plan (via Stripe on Organization model)
    const orgPlan = (stripeValid && org?.plan) ? org.plan : 'starter';
    // Individual plan (via Apple IAP on ZKUser)
    const individualPlan = (appleValid && applePlan) ? applePlan : 'starter';
    // Effective = max(org, individual)
    const effectivePlan = getPlanPriority(orgPlan) >= getPlanPriority(individualPlan)
      ? orgPlan : individualPlan;

    // Determine expiration date (latest of the two)
    let expiresAt: Date | null = null;
    if (stripePeriodEnd && stripeValid) expiresAt = stripePeriodEnd;
    if (zkUser.appleExpiresDate && appleValid) {
      if (!expiresAt || zkUser.appleExpiresDate > expiresAt) {
        expiresAt = zkUser.appleExpiresDate;
      }
    }

    // Detect redundant subscription: user has BOTH an active individual sub
    // AND an org sub where org plan >= individual plan
    const hasRedundantSubscription = appleValid && stripeValid
      && getPlanPriority(orgPlan) >= getPlanPriority(individualPlan);

    const features = getPlanFeatures(effectivePlan);

    const response = successResponse({
      user: {
        id: zkUser.id,
        email: zkUser.email,
        name: zkUser.webUser?.name || null,
      },
      license: {
        valid: hasValidLicense,
        plan: effectivePlan,
        status: hasValidLicense ? 'active' : (org?.subscriptionStatus || 'free'),
        expiresAt: expiresAt?.toISOString() || null,
        currentPeriodStart: org?.currentPeriodStart?.toISOString() || null,
        currentPeriodEnd: org?.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: org?.cancelAtPeriodEnd || false,
        seats: org?.seats || 1,
        teamId: org?.id || null,
        teamName: org?.name || null,
        source: stripeValid ? 'stripe' : (appleValid ? 'apple' : 'none'),
      },
      subscription: {
        individual: {
          active: appleValid,
          plan: individualPlan,
          source: appleValid ? 'apple' : 'none',
          expiresAt: zkUser.appleExpiresDate?.toISOString() || null,
        },
        organization: {
          active: stripeValid,
          plan: orgPlan,
          orgId: org?.id || null,
          orgName: org?.name || null,
        },
        effectivePlan,
        hasRedundantSubscription,
      },
      features: features,
      limits: getPlanLimits(effectivePlan),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get license error:', error);
    return errorResponse('Failed to retrieve license status', 500);
  }
}

// getApplePlan is imported from @/lib/zk/apple-plan

// Get plan priority for comparison
function getPlanPriority(plan: string): number {
  const priorities: Record<string, number> = {
    starter: 0,
    pro: 1,
    team: 2,
    business: 3,
    enterprise: 4,
  };
  return priorities[plan] || 0;
}

function getPlanFeatures(plan: string): Record<string, boolean> {
  return getFeaturesForPlan(plan) as unknown as Record<string, boolean>;
}

function getPlanLimits(plan: string): Record<string, number> {
  const limits = getLimitsForPlan(plan);
  return {
    maxHosts: limits.maxHosts,
    maxKeys: limits.maxKeys,
    maxIdentities: limits.maxIdentities,
    maxVaults: limits.maxVaults,
    maxDevices: limits.maxDevices,
    maxVaultItems: limits.maxVaultItems,
  };
}
