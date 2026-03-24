import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    zKUser: { findUnique: vi.fn() },
    zKVault: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    organizationUser: { findMany: vi.fn() },
    zKVaultItem: { count: vi.fn() },
  },
}));

import { checkVaultItemLimit } from '../vault-limits';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as unknown as {
  zKUser: { findUnique: ReturnType<typeof vi.fn> };
  zKVault: { findUnique: ReturnType<typeof vi.fn> };
  organization: { findUnique: ReturnType<typeof vi.fn> };
  organizationUser: { findMany: ReturnType<typeof vi.fn> };
  zKVaultItem: { count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// User not found
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — user not found', () => {
  it('returns disallowed when user does not exist', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue(null);

    const result = await checkVaultItemLimit('nonexistent');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.plan).toBe('starter');
    expect(result.scope).toBe('personal');
  });
});

// ---------------------------------------------------------------------------
// Personal vault — starter plan (limited)
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — personal vault, starter plan', () => {
  it('allows when below limit', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(5);

    const result = await checkVaultItemLimit('u1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(5); // 10 - 5
    expect(result.currentCount).toBe(5);
    expect(result.maxVaultItems).toBe(10);
    expect(result.plan).toBe('starter');
    expect(result.scope).toBe('personal');
  });

  it('disallows when at limit', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(10);

    const result = await checkVaultItemLimit('u1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('disallows when above limit', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(15);

    const result = await checkVaultItemLimit('u1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// Personal vault — pro plan (unlimited vault items)
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — personal vault, pro plan (unlimited)', () => {
  it('allows unlimited items for pro plan', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'pro' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    const result = await checkVaultItemLimit('u1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(-1);
    expect(result.maxVaultItems).toBe(-1);
    expect(result.plan).toBe('pro');
  });
});

// ---------------------------------------------------------------------------
// Personal vault — uses best plan from org memberships
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — best plan from org memberships', () => {
  it('uses org plan when higher than user plan', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      {
        organization: {
          plan: 'team',
          subscriptionStatus: 'active',
        },
      },
    ]);

    const result = await checkVaultItemLimit('u1');
    expect(result.plan).toBe('team');
    expect(result.maxVaultItems).toBe(-1); // team plan = unlimited
    expect(result.allowed).toBe(true);
  });

  it('falls back to starter when org plan is not active', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      {
        organization: {
          plan: 'team',
          subscriptionStatus: 'canceled',
        },
      },
    ]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(3);

    const result = await checkVaultItemLimit('u1');
    expect(result.plan).toBe('starter');
    expect(result.maxVaultItems).toBe(10);
  });

  it('normalizes "free" to "starter"', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'free' },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(0);

    const result = await checkVaultItemLimit('u1');
    expect(result.plan).toBe('starter');
  });
});

// ---------------------------------------------------------------------------
// Organization vault — scoped to org's plan
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — organization vault', () => {
  it('uses org plan for org vault', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.zKVault.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      userId: null,
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      subscriptionStatus: 'active',
    });

    const result = await checkVaultItemLimit('u1', 'vault-org');
    expect(result.scope).toBe('organization');
    expect(result.plan).toBe('team');
    expect(result.maxVaultItems).toBe(-1); // team = unlimited
    expect(result.allowed).toBe(true);
  });

  it('falls back to starter for inactive org subscription', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'starter' },
    });
    mockPrisma.zKVault.findUnique.mockResolvedValue({
      organizationId: 'org-1',
      userId: null,
    });
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      subscriptionStatus: 'canceled',
    });
    mockPrisma.zKVaultItem.count.mockResolvedValue(5);

    const result = await checkVaultItemLimit('u1', 'vault-org');
    expect(result.scope).toBe('organization');
    expect(result.plan).toBe('starter');
    expect(result.maxVaultItems).toBe(10);
  });

  it('treats personal vault (no orgId) as personal scope', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: { plan: 'pro' },
    });
    mockPrisma.zKVault.findUnique.mockResolvedValue({
      organizationId: null,
      userId: 'u1',
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    const result = await checkVaultItemLimit('u1', 'vault-personal');
    expect(result.scope).toBe('personal');
    expect(result.plan).toBe('pro');
  });
});

// ---------------------------------------------------------------------------
// No webUser
// ---------------------------------------------------------------------------

describe('checkVaultItemLimit — no webUser link', () => {
  it('defaults to starter when no webUser', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'u1',
      webUser: null,
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);
    mockPrisma.zKVaultItem.count.mockResolvedValue(0);

    const result = await checkVaultItemLimit('u1');
    expect(result.plan).toBe('starter');
  });
});
