import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

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
            team: {
              select: {
                id: true,
                name: true,
                plan: true,
                seats: true,
                subscriptionStatus: true,
                currentPeriodStart: true,
                currentPeriodEnd: true,
                cancelAtPeriodEnd: true,
              },
            },
          },
        },
      },
    });

    if (!zkUser) {
      return errorResponse('User not found', 404);
    }

    const now = new Date();
    const team = zkUser.webUser?.team;

    // Check Stripe subscription (web purchase)
    const stripeActive = team?.subscriptionStatus === 'active' || team?.subscriptionStatus === 'trialing';
    const stripePastDue = team?.subscriptionStatus === 'past_due';
    const stripePeriodEnd = team?.currentPeriodEnd;
    const stripeWithinPeriod = stripePeriodEnd ? stripePeriodEnd > now : false;
    const stripeValid = stripeActive || (stripeWithinPeriod && !stripePastDue);

    // Check Apple IAP subscription
    const appleValid = zkUser.appleExpiresDate ? zkUser.appleExpiresDate > now : false;
    const applePlan = zkUser.appleProductId ? getApplePlan(zkUser.appleProductId) : null;

    // Valid license: either Stripe OR Apple IAP is valid
    const hasValidLicense = stripeValid || appleValid;
    
    // Determine effective plan (prefer higher tier)
    let effectivePlan = 'starter';
    if (stripeValid && team?.plan) {
      effectivePlan = team.plan;
    }
    if (appleValid && applePlan) {
      effectivePlan = getPlanPriority(applePlan) > getPlanPriority(effectivePlan) ? applePlan : effectivePlan;
    }

    // Determine expiration date (latest of the two)
    let expiresAt: Date | null = null;
    if (stripePeriodEnd && stripeValid) expiresAt = stripePeriodEnd;
    if (zkUser.appleExpiresDate && appleValid) {
      if (!expiresAt || zkUser.appleExpiresDate > expiresAt) {
        expiresAt = zkUser.appleExpiresDate;
      }
    }

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
        status: hasValidLicense ? 'active' : (team?.subscriptionStatus || 'free'),
        expiresAt: expiresAt?.toISOString() || null,
        currentPeriodStart: team?.currentPeriodStart?.toISOString() || null,
        currentPeriodEnd: team?.currentPeriodEnd?.toISOString() || null,
        cancelAtPeriodEnd: team?.cancelAtPeriodEnd || false,
        seats: team?.seats || 1,
        teamId: team?.id || null,
        teamName: team?.name || null,
        source: stripeValid ? 'stripe' : (appleValid ? 'apple' : 'none'),
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

// Map Apple product IDs to plan names
function getApplePlan(productId: string): string {
  const mapping: Record<string, string> = {
    'com.deepterm.pro.monthly': 'pro',
    'com.deepterm.pro.yearly': 'pro',
    'com.deepterm.team.monthly': 'team',
    'com.deepterm.team.yearly': 'team',
  };
  return mapping[productId] || 'pro';
}

// Get plan priority for comparison
function getPlanPriority(plan: string): number {
  const priorities: Record<string, number> = {
    starter: 0,
    pro: 1,
    team: 2,
    business: 3,
    enterprise: 3,
  };
  return priorities[plan] || 0;
}

function getPlanFeatures(plan: string): Record<string, boolean> {
  const features: Record<string, Record<string, boolean>> = {
    starter: {
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
    pro: {
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
    team: {
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
    enterprise: {
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
    business: {
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
  };

  return features[plan] || features.starter;
}

function getPlanLimits(plan: string): Record<string, number> {
  const limits: Record<string, Record<string, number>> = {
    starter: {
      maxHosts: 5,
      maxVaults: 1,
      maxDevices: 1,
    },
    pro: {
      maxHosts: -1, // unlimited
      maxVaults: 10,
      maxDevices: -1, // unlimited
    },
    team: {
      maxHosts: -1,
      maxVaults: -1,
      maxDevices: -1,
    },
    enterprise: {
      maxHosts: -1,
      maxVaults: -1,
      maxDevices: -1,
    },
    business: {
      maxHosts: -1,
      maxVaults: -1,
      maxDevices: -1,
    },
  };

  return limits[plan] || limits.starter;
}
