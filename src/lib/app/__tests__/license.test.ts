import { describe, it, expect } from 'vitest';
import {
  PLAN_FEATURES,
  determineLicenseStatus,
  type PlanFeatures,
  type LicenseStatus,
} from '../license';

// ---------------------------------------------------------------------------
// PLAN_FEATURES constant tests
// ---------------------------------------------------------------------------

describe('PLAN_FEATURES', () => {
  it('defines free plan with correct limits', () => {
    const free = PLAN_FEATURES.free;
    expect(free.maxVaults).toBe(1);
    expect(free.maxCredentials).toBe(10);
    expect(free.maxTeamMembers).toBe(0);
    expect(free.ssoEnabled).toBe(false);
    expect(free.prioritySupport).toBe(false);
  });

  it('defines starter plan with correct limits', () => {
    const starter = PLAN_FEATURES.starter;
    expect(starter.maxVaults).toBe(5);
    expect(starter.maxCredentials).toBe(50);
    expect(starter.maxTeamMembers).toBe(3);
    expect(starter.ssoEnabled).toBe(false);
    expect(starter.prioritySupport).toBe(false);
  });

  it('defines pro plan with priority support', () => {
    const pro = PLAN_FEATURES.pro;
    expect(pro.maxVaults).toBe(20);
    expect(pro.maxCredentials).toBe(200);
    expect(pro.maxTeamMembers).toBe(10);
    expect(pro.ssoEnabled).toBe(false);
    expect(pro.prioritySupport).toBe(true);
  });

  it('defines team plan with SSO enabled', () => {
    const team = PLAN_FEATURES.team;
    expect(team.maxVaults).toBe(100);
    expect(team.maxCredentials).toBe(1000);
    expect(team.maxTeamMembers).toBe(50);
    expect(team.ssoEnabled).toBe(true);
    expect(team.prioritySupport).toBe(true);
  });

  it('defines enterprise plan with unlimited resources', () => {
    const enterprise = PLAN_FEATURES.enterprise;
    expect(enterprise.maxVaults).toBe(-1);
    expect(enterprise.maxCredentials).toBe(-1);
    expect(enterprise.maxTeamMembers).toBe(-1);
    expect(enterprise.ssoEnabled).toBe(true);
    expect(enterprise.prioritySupport).toBe(true);
  });

  it('defines business plan with unlimited resources', () => {
    const business = PLAN_FEATURES.business;
    expect(business.maxVaults).toBe(-1);
    expect(business.maxCredentials).toBe(-1);
    expect(business.maxTeamMembers).toBe(-1);
    expect(business.ssoEnabled).toBe(true);
    expect(business.prioritySupport).toBe(true);
  });

  it('has all six plans defined', () => {
    const plans = Object.keys(PLAN_FEATURES);
    expect(plans).toContain('free');
    expect(plans).toContain('starter');
    expect(plans).toContain('pro');
    expect(plans).toContain('team');
    expect(plans).toContain('enterprise');
    expect(plans).toContain('business');
    expect(plans.length).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// determineLicenseStatus tests
// ---------------------------------------------------------------------------

describe('determineLicenseStatus', () => {
  // --- Individual user (no team) ---

  it('returns free plan for user with no plan set', () => {
    const result = determineLicenseStatus({});
    expect(result.plan).toBe('free');
    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
    expect(result.teamId).toBeNull();
    expect(result.teamName).toBeNull();
    expect(result.seats).toBe(1);
    expect(result.expiresAt).toBeNull();
    expect(result.features).toEqual(PLAN_FEATURES.free);
  });

  it('returns free plan for user with null plan', () => {
    const result = determineLicenseStatus({ plan: null });
    expect(result.plan).toBe('free');
    expect(result.valid).toBe(true);
    expect(result.features).toEqual(PLAN_FEATURES.free);
  });

  it('returns correct plan for pro user', () => {
    const result = determineLicenseStatus({ plan: 'pro' });
    expect(result.plan).toBe('pro');
    expect(result.valid).toBe(true);
    expect(result.features).toEqual(PLAN_FEATURES.pro);
  });

  it('returns correct plan for starter user', () => {
    const result = determineLicenseStatus({ plan: 'starter' });
    expect(result.plan).toBe('starter');
    expect(result.valid).toBe(true);
    expect(result.features).toEqual(PLAN_FEATURES.starter);
  });

  it('includes expiresAt for individual user', () => {
    const expiresAt = new Date('2027-01-01T00:00:00Z');
    const result = determineLicenseStatus({
      plan: 'pro',
      subscriptionExpiresAt: expiresAt,
    });
    expect(result.expiresAt).toBe(expiresAt.toISOString());
  });

  it('falls back to free features for unknown plan', () => {
    const result = determineLicenseStatus({ plan: 'nonexistent_plan' });
    expect(result.plan).toBe('nonexistent_plan');
    expect(result.features).toEqual(PLAN_FEATURES.free);
  });

  // --- Team user ---

  it('uses team plan over user plan when team exists', () => {
    const result = determineLicenseStatus({
      plan: 'free',
      team: {
        id: 'team-123',
        name: 'My Team',
        plan: 'team',
        subscriptionStatus: 'active',
        currentPeriodEnd: new Date('2027-06-01'),
        seats: 25,
      },
    });
    expect(result.plan).toBe('team');
    expect(result.valid).toBe(true);
    expect(result.teamId).toBe('team-123');
    expect(result.teamName).toBe('My Team');
    expect(result.seats).toBe(25);
    expect(result.features).toEqual(PLAN_FEATURES.team);
  });

  it('falls back to user plan when team plan is null', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 'team-123',
        name: 'My Team',
        plan: null,
        subscriptionStatus: 'active',
        currentPeriodEnd: null,
        seats: 5,
      },
    });
    expect(result.plan).toBe('pro');
    expect(result.features).toEqual(PLAN_FEATURES.pro);
  });

  it('uses team currentPeriodEnd over user subscriptionExpiresAt', () => {
    const userExpires = new Date('2026-06-01');
    const teamExpires = new Date('2027-12-01');
    const result = determineLicenseStatus({
      plan: 'pro',
      subscriptionExpiresAt: userExpires,
      team: {
        id: 'team-1',
        name: 'Team',
        plan: 'enterprise',
        subscriptionStatus: 'active',
        currentPeriodEnd: teamExpires,
        seats: 100,
      },
    });
    expect(result.expiresAt).toBe(teamExpires.toISOString());
  });

  it('returns seats=1 when team has null seats', () => {
    const result = determineLicenseStatus({
      team: {
        id: 'team-1',
        name: 'Team',
        plan: 'team',
        seats: null,
      },
    });
    expect(result.seats).toBe(1);
  });

  // --- Subscription status ---

  it('treats active subscription as valid', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'active',
      },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('active');
  });

  it('treats trialing subscription as valid', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'trialing',
      },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('trialing');
  });

  it('treats past_due subscription as valid if not expired', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'past_due',
        currentPeriodEnd: futureDate,
      },
    });
    expect(result.valid).toBe(true);
    expect(result.status).toBe('past_due');
  });

  it('treats past_due subscription as invalid if expired', () => {
    const pastDate = new Date('2020-01-01');
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'past_due',
        currentPeriodEnd: pastDate,
      },
    });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('past_due');
  });

  it('treats past_due subscription as invalid if no expiresAt', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'past_due',
        currentPeriodEnd: null,
      },
    });
    expect(result.valid).toBe(false);
  });

  it('treats canceled subscription as invalid', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'canceled',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('canceled');
  });

  it('treats unpaid subscription as invalid', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: {
        id: 't1',
        name: 'T',
        subscriptionStatus: 'unpaid',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.status).toBe('unpaid');
  });

  // --- Return shape ---

  it('returns all required fields in LicenseStatus', () => {
    const result = determineLicenseStatus({ plan: 'pro' });
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('plan');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('teamId');
    expect(result).toHaveProperty('teamName');
    expect(result).toHaveProperty('seats');
    expect(result).toHaveProperty('expiresAt');
    expect(result).toHaveProperty('features');
  });

  // --- Null team ---

  it('handles null team gracefully', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
      team: null,
    });
    expect(result.teamId).toBeNull();
    expect(result.teamName).toBeNull();
    expect(result.seats).toBe(1);
  });

  it('handles undefined team gracefully', () => {
    const result = determineLicenseStatus({
      plan: 'pro',
    });
    expect(result.teamId).toBeNull();
    expect(result.teamName).toBeNull();
  });
});
