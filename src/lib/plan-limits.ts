// src/lib/plan-limits.ts
// Single source of truth for all plan limits across the web app.
// The macOS app's LicenseManager.swift must match these values.

export type PlanKey = 'starter' | 'pro' | 'team' | 'business' | 'enterprise';

export interface PlanLimits {
  maxHosts: number;        // -1 = unlimited
  maxKeys: number;         // SSH keys, certificates (Keychain feature)
  maxIdentities: number;   // Reusable auth profiles (Keychain feature)
  maxVaults: number;
  maxDevices: number;
  maxVaultItems: number;   // Total vault items (enforced server-side)
}

export interface PlanFeatures {
  unlimitedHosts: boolean;
  aiAssistant: boolean;
  cloudVault: boolean;
  allDevices: boolean;
  sftpClient: boolean;
  portForwarding: boolean;
  prioritySupport: boolean;
  teamVaults: boolean;
  sso: boolean;
  auditLogs: boolean;
  roleBasedAccess: boolean;
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  starter: {
    maxHosts: 3,
    maxKeys: 2,
    maxIdentities: 2,
    maxVaults: 1,
    maxDevices: 1,
    maxVaultItems: 10,
  },
  pro: {
    maxHosts: -1,
    maxKeys: -1,
    maxIdentities: -1,
    maxVaults: 10,
    maxDevices: -1,
    maxVaultItems: -1,
  },
  team: {
    maxHosts: -1,
    maxKeys: -1,
    maxIdentities: -1,
    maxVaults: -1,
    maxDevices: -1,
    maxVaultItems: -1,
  },
  business: {
    maxHosts: -1,
    maxKeys: -1,
    maxIdentities: -1,
    maxVaults: -1,
    maxDevices: -1,
    maxVaultItems: -1,
  },
  enterprise: {
    maxHosts: -1,
    maxKeys: -1,
    maxIdentities: -1,
    maxVaults: -1,
    maxDevices: -1,
    maxVaultItems: -1,
  },
};

export const PLAN_FEATURES: Record<PlanKey, PlanFeatures> = {
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
};

export function getLimitsForPlan(plan: string): PlanLimits {
  return PLAN_LIMITS[plan as PlanKey] || PLAN_LIMITS.starter;
}

export function getFeaturesForPlan(plan: string): PlanFeatures {
  return PLAN_FEATURES[plan as PlanKey] || PLAN_FEATURES.starter;
}

export function isWithinLimit(current: number, max: number): boolean {
  return max === -1 || current < max;
}
