/**
 * Shared license determination helpers for the /api/app routes.
 *
 * Both /api/app/login and /api/app/validate used to duplicate PLAN_FEATURES
 * and the subscription-validity check. This module is the single source of
 * truth so changes only need to happen in one place.
 */

// ---------------------------------------------------------------------------
// Plan features
// ---------------------------------------------------------------------------

export interface PlanFeatures {
  maxVaults: number;
  maxCredentials: number;
  maxTeamMembers: number;
  ssoEnabled: boolean;
  prioritySupport: boolean;
}

export const PLAN_FEATURES: Record<string, PlanFeatures> = {
  free: {
    maxVaults: 1,
    maxCredentials: 10,
    maxTeamMembers: 0,
    ssoEnabled: false,
    prioritySupport: false,
  },
  starter: {
    maxVaults: 1,
    maxCredentials: 10,
    maxTeamMembers: 0,
    ssoEnabled: false,
    prioritySupport: false,
  },
  pro: {
    maxVaults: 10,
    maxCredentials: -1,
    maxTeamMembers: 0,
    ssoEnabled: false,
    prioritySupport: true,
  },
  team: {
    maxVaults: -1,
    maxCredentials: -1,
    maxTeamMembers: 50,
    ssoEnabled: false,
    prioritySupport: true,
  },
  enterprise: {
    maxVaults: -1,
    maxCredentials: -1,
    maxTeamMembers: -1,
    ssoEnabled: true,
    prioritySupport: true,
  },
  business: {
    maxVaults: -1,
    maxCredentials: -1,
    maxTeamMembers: -1,
    ssoEnabled: true,
    prioritySupport: true,
  },
};

// ---------------------------------------------------------------------------
// License status computation
// ---------------------------------------------------------------------------

export interface LicenseStatus {
  valid: boolean;
  plan: string;
  status: string;
  teamId: string | null;
  teamName: string | null;
  seats: number;
  expiresAt: string | null;
  features: PlanFeatures;
}

/**
 * Derive the licence status for a `User` row.
 *
 * @param user  A Prisma `User` row.
 * @param org   Optional Organization data (billing is on Organization now).
 */
export function determineLicenseStatus(user: {
  plan?: string | null;
  subscriptionExpiresAt?: Date | null;
}, org?: {
  id: string;
  name: string;
  plan?: string | null;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: Date | null;
  seats?: number | null;
} | null): LicenseStatus {
  let plan = user.plan || 'free';
  let subscriptionStatus = 'active';
  let expiresAt: Date | null = user.subscriptionExpiresAt ?? null;

  if (org) {
    plan = org.plan || plan;
    subscriptionStatus = org.subscriptionStatus || 'active';
    expiresAt = org.currentPeriodEnd ?? expiresAt;
  }

  const isSubscriptionValid =
    subscriptionStatus === 'active' ||
    subscriptionStatus === 'trialing' ||
    (subscriptionStatus === 'past_due' && expiresAt != null && expiresAt > new Date());

  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.free;

  return {
    valid: isSubscriptionValid,
    plan,
    status: subscriptionStatus,
    teamId: org?.id ?? null,
    teamName: org?.name ?? null,
    seats: org?.seats ?? 1,
    expiresAt: expiresAt?.toISOString() ?? null,
    features,
  };
}
