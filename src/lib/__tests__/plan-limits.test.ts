import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  PLAN_FEATURES,
  getLimitsForPlan,
  getFeaturesForPlan,
  isWithinLimit,
  type PlanKey,
} from '../plan-limits';

// ---------------------------------------------------------------------------
// PLAN_LIMITS constant tests
// ---------------------------------------------------------------------------

describe('PLAN_LIMITS', () => {
  it('defines starter plan with correct limits', () => {
    const starter = PLAN_LIMITS.starter;
    expect(starter.maxHosts).toBe(3);
    expect(starter.maxKeys).toBe(2);
    expect(starter.maxIdentities).toBe(2);
    expect(starter.maxVaults).toBe(1);
    expect(starter.maxDevices).toBe(1);
    expect(starter.maxVaultItems).toBe(10);
  });

  it('defines pro plan with unlimited hosts and vault items', () => {
    const pro = PLAN_LIMITS.pro;
    expect(pro.maxHosts).toBe(-1);
    expect(pro.maxKeys).toBe(-1);
    expect(pro.maxIdentities).toBe(-1);
    expect(pro.maxVaults).toBe(10);
    expect(pro.maxDevices).toBe(-1);
    expect(pro.maxVaultItems).toBe(-1);
  });

  it('defines team plan with all unlimited', () => {
    const team = PLAN_LIMITS.team;
    expect(team.maxHosts).toBe(-1);
    expect(team.maxKeys).toBe(-1);
    expect(team.maxIdentities).toBe(-1);
    expect(team.maxVaults).toBe(-1);
    expect(team.maxDevices).toBe(-1);
    expect(team.maxVaultItems).toBe(-1);
  });

  it('defines business plan with all unlimited', () => {
    const business = PLAN_LIMITS.business;
    expect(business.maxHosts).toBe(-1);
    expect(business.maxVaultItems).toBe(-1);
  });

  it('defines enterprise plan with all unlimited', () => {
    const enterprise = PLAN_LIMITS.enterprise;
    expect(enterprise.maxHosts).toBe(-1);
    expect(enterprise.maxVaultItems).toBe(-1);
  });

  it('has all five plan tiers defined', () => {
    const plans = Object.keys(PLAN_LIMITS);
    expect(plans).toContain('starter');
    expect(plans).toContain('pro');
    expect(plans).toContain('team');
    expect(plans).toContain('business');
    expect(plans).toContain('enterprise');
    expect(plans.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// PLAN_FEATURES constant tests
// ---------------------------------------------------------------------------

describe('PLAN_FEATURES', () => {
  it('defines starter plan with basic features enabled', () => {
    const starter = PLAN_FEATURES.starter;
    expect(starter.unlimitedHosts).toBe(false);
    expect(starter.aiAssistant).toBe(true);       // Basic AI included
    expect(starter.cloudVault).toBe(false);
    expect(starter.allDevices).toBe(false);
    expect(starter.sftpClient).toBe(true);         // SFTP included in Starter
    expect(starter.portForwarding).toBe(true);     // Port Forwarding included in Starter
    expect(starter.prioritySupport).toBe(false);
    expect(starter.teamVaults).toBe(false);
    expect(starter.sso).toBe(false);
    expect(starter.auditLogs).toBe(false);
    expect(starter.roleBasedAccess).toBe(false);
  });

  it('defines pro plan with individual features enabled', () => {
    const pro = PLAN_FEATURES.pro;
    expect(pro.unlimitedHosts).toBe(true);
    expect(pro.aiAssistant).toBe(true);
    expect(pro.cloudVault).toBe(true);
    expect(pro.allDevices).toBe(true);
    expect(pro.sftpClient).toBe(true);
    expect(pro.portForwarding).toBe(true);
    expect(pro.prioritySupport).toBe(true);
    // Team features still disabled
    expect(pro.teamVaults).toBe(false);
    expect(pro.sso).toBe(false);
    expect(pro.auditLogs).toBe(false);
    expect(pro.roleBasedAccess).toBe(false);
  });

  it('defines team plan with collaboration features (no SSO)', () => {
    const team = PLAN_FEATURES.team;
    expect(team.unlimitedHosts).toBe(true);
    expect(team.teamVaults).toBe(true);
    expect(team.sso).toBe(false);  // SSO is Business-only
    expect(team.auditLogs).toBe(true);
    expect(team.roleBasedAccess).toBe(true);
  });

  it('defines business and enterprise with all features', () => {
    for (const planKey of ['business', 'enterprise'] as PlanKey[]) {
      const plan = PLAN_FEATURES[planKey];
      expect(plan.unlimitedHosts).toBe(true);
      expect(plan.teamVaults).toBe(true);
      expect(plan.sso).toBe(true);
      expect(plan.auditLogs).toBe(true);
      expect(plan.roleBasedAccess).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getLimitsForPlan tests
// ---------------------------------------------------------------------------

describe('getLimitsForPlan', () => {
  it('returns starter limits for "starter"', () => {
    const limits = getLimitsForPlan('starter');
    expect(limits).toEqual(PLAN_LIMITS.starter);
  });

  it('returns pro limits for "pro"', () => {
    const limits = getLimitsForPlan('pro');
    expect(limits).toEqual(PLAN_LIMITS.pro);
  });

  it('returns team limits for "team"', () => {
    const limits = getLimitsForPlan('team');
    expect(limits).toEqual(PLAN_LIMITS.team);
  });

  it('normalizes "free" to starter limits', () => {
    const limits = getLimitsForPlan('free');
    expect(limits).toEqual(PLAN_LIMITS.starter);
  });

  it('falls back to starter for unknown plan', () => {
    const limits = getLimitsForPlan('nonexistent');
    expect(limits).toEqual(PLAN_LIMITS.starter);
  });

  it('falls back to starter for empty string', () => {
    const limits = getLimitsForPlan('');
    expect(limits).toEqual(PLAN_LIMITS.starter);
  });
});

// ---------------------------------------------------------------------------
// getFeaturesForPlan tests
// ---------------------------------------------------------------------------

describe('getFeaturesForPlan', () => {
  it('returns starter features for "starter"', () => {
    const features = getFeaturesForPlan('starter');
    expect(features).toEqual(PLAN_FEATURES.starter);
  });

  it('returns pro features for "pro"', () => {
    const features = getFeaturesForPlan('pro');
    expect(features).toEqual(PLAN_FEATURES.pro);
  });

  it('normalizes "free" to starter features', () => {
    const features = getFeaturesForPlan('free');
    expect(features).toEqual(PLAN_FEATURES.starter);
  });

  it('falls back to starter for unknown plan', () => {
    const features = getFeaturesForPlan('unknown_plan');
    expect(features).toEqual(PLAN_FEATURES.starter);
  });
});

// ---------------------------------------------------------------------------
// isWithinLimit tests
// ---------------------------------------------------------------------------

describe('isWithinLimit', () => {
  it('returns true when current is below max', () => {
    expect(isWithinLimit(3, 10)).toBe(true);
  });

  it('returns false when current equals max', () => {
    expect(isWithinLimit(10, 10)).toBe(false);
  });

  it('returns false when current exceeds max', () => {
    expect(isWithinLimit(15, 10)).toBe(false);
  });

  it('returns true when current is 0', () => {
    expect(isWithinLimit(0, 10)).toBe(true);
  });

  it('returns true for unlimited (-1)', () => {
    expect(isWithinLimit(0, -1)).toBe(true);
    expect(isWithinLimit(1000, -1)).toBe(true);
    expect(isWithinLimit(999999, -1)).toBe(true);
  });
});
