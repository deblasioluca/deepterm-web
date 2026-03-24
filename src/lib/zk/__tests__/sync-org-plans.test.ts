import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organizationUser: { findMany: vi.fn(), count: vi.fn() },
    organization: { findUnique: vi.fn() },
    zKUser: { findUnique: vi.fn() },
    user: { findMany: vi.fn(), update: vi.fn() },
  },
}));

// Mock apple-plan
vi.mock('../apple-plan', () => ({
  getApplePlan: vi.fn((productId: string) =>
    productId.includes('team') ? 'team' : 'pro'
  ),
}));

import {
  syncOrgMemberPlans,
  syncNewMemberPlan,
  clearRemovedMemberPlan,
} from '../sync-org-plans';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as unknown as {
  organizationUser: {
    findMany: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
  };
  organization: { findUnique: ReturnType<typeof vi.fn> };
  zKUser: { findUnique: ReturnType<typeof vi.fn> };
  user: {
    findMany: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// syncOrgMemberPlans
// ---------------------------------------------------------------------------

describe('syncOrgMemberPlans', () => {
  it('only queries org-covered members (seatCoveredByOrg: true)', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    await syncOrgMemberPlans('org-1', 'team', 'cus_1', 'sub_1');

    expect(mockPrisma.organizationUser.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', status: 'confirmed', seatCoveredByOrg: true },
      include: { user: { include: { webUser: true } } },
    });
  });

  it('upgrades free member to org plan when org has active plan', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'wu-1', plan: 'free', subscriptionScope: 'none' },
    ]);

    await syncOrgMemberPlans('org-1', 'team', 'cus_1', 'sub_1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'team',
        subscriptionScope: 'organization',
        stripeSubscriptionId: 'sub_1',
      },
    });
  });

  it('does not downgrade member with higher individual plan', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'wu-1', plan: 'business', subscriptionScope: 'individual' },
    ]);

    await syncOrgMemberPlans('org-1', 'pro', 'cus_1', 'sub_1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'business',
        subscriptionScope: 'individual',
      },
    });
  });

  it('always applies org plan to org-scoped members (handles downgrades)', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'wu-1', plan: 'business', subscriptionScope: 'organization' },
    ]);

    // Org downgraded from business to pro
    await syncOrgMemberPlans('org-1', 'pro', 'cus_1', 'sub_1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'pro',
        subscriptionScope: 'organization',
        stripeSubscriptionId: 'sub_1',
      },
    });
  });

  it('on org downgrade to free, falls back to another org-covered membership', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'wu-1',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
        subscriptionScope: 'organization',
        zkUser: { id: 'zk-1', appleProductId: null },
      },
    ]);

    // Other org membership (covered) with active plan
    mockPrisma.organizationUser.findMany
      .mockResolvedValueOnce([{ user: { webUser: { id: 'wu-1' } } }]) // initial query
      .mockResolvedValueOnce([
        {
          organization: {
            plan: 'business',
            subscriptionStatus: 'active',
            stripeSubscriptionId: 'sub_other',
          },
        },
      ]); // fallback query

    await syncOrgMemberPlans('org-1', 'free', null, null);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'business',
        stripeSubscriptionId: 'sub_other',
        subscriptionScope: 'organization',
      },
    });
  });

  it('on org downgrade to free, fallback query filters by seatCoveredByOrg', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'wu-1',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
        subscriptionScope: 'organization',
        zkUser: { id: 'zk-1', appleProductId: null },
      },
    ]);
    // No other org-covered memberships
    mockPrisma.organizationUser.findMany
      .mockResolvedValueOnce([{ user: { webUser: { id: 'wu-1' } } }])
      .mockResolvedValueOnce([]);

    await syncOrgMemberPlans('org-1', 'free', null, null);

    // Verify the fallback query included seatCoveredByOrg: true
    const fallbackCall = mockPrisma.organizationUser.findMany.mock.calls[1];
    expect(fallbackCall[0].where).toHaveProperty('seatCoveredByOrg', true);
  });

  it('on org downgrade to free with no fallback, resets to free', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'wu-1',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
        subscriptionScope: 'organization',
        zkUser: { id: 'zk-1', appleProductId: null },
      },
    ]);
    mockPrisma.organizationUser.findMany
      .mockResolvedValueOnce([{ user: { webUser: { id: 'wu-1' } } }])
      .mockResolvedValueOnce([]); // no other orgs

    await syncOrgMemberPlans('org-1', 'free', null, null);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'free',
        stripeSubscriptionId: null,
        subscriptionScope: 'none',
      },
    });
  });

  it('on org downgrade to free, preserves Apple IAP individual subscription', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: { id: 'wu-1' } } },
    ]);
    mockPrisma.user.findMany.mockResolvedValue([
      {
        id: 'wu-1',
        subscriptionSource: 'appstore',
        subscriptionExpiresAt: futureDate,
        subscriptionScope: 'organization',
        zkUser: { id: 'zk-1', appleProductId: 'com.deepterm.pro.monthly' },
      },
    ]);
    mockPrisma.organizationUser.findMany
      .mockResolvedValueOnce([{ user: { webUser: { id: 'wu-1' } } }])
      .mockResolvedValueOnce([]); // no other orgs

    await syncOrgMemberPlans('org-1', 'free', null, null);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'pro',
        stripeSubscriptionId: null,
        subscriptionScope: 'individual',
      },
    });
  });

  it('skips members without webUser records', async () => {
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      { user: { webUser: null } },
      { user: null },
    ]);

    await syncOrgMemberPlans('org-1', 'team', 'cus_1', 'sub_1');

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// syncNewMemberPlan
// ---------------------------------------------------------------------------

describe('syncNewMemberPlan', () => {
  it('upgrades free member to org plan', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'free', subscriptionScope: 'none' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'team',
        subscriptionScope: 'organization',
        stripeSubscriptionId: 'sub_1',
      },
    });
  });

  it('does not downgrade member with higher individual plan', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'pro',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'business', subscriptionScope: 'individual' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'business',
        subscriptionScope: 'individual',
      },
    });
  });

  it('upgrades equal-rank plan with org scope (equal rank = org wins)', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'team', subscriptionScope: 'individual' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'team',
        subscriptionScope: 'organization',
        stripeSubscriptionId: 'sub_1',
      },
    });
  });

  it('does nothing when org is not found', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue(null);

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.zKUser.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when org plan is free', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'free',
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      subscriptionStatus: null,
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'free', subscriptionScope: 'none' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('does nothing when zkUser has no webUser', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: null,
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('treats trialing subscription as active', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'business',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'trialing',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'free', subscriptionScope: 'none' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: expect.objectContaining({ plan: 'business' }),
    });
  });

  it('treats inactive subscription as free', async () => {
    mockPrisma.organization.findUnique.mockResolvedValue({
      plan: 'team',
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'canceled',
    });
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      webUser: { id: 'wu-1', plan: 'free', subscriptionScope: 'none' },
    });

    await syncNewMemberPlan('org-1', 'zk-1');

    // Plan is 'free' because subscription is canceled, so no update
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// clearRemovedMemberPlan
// ---------------------------------------------------------------------------

describe('clearRemovedMemberPlan', () => {
  it('resets org-scoped member to free when no fallback exists', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'free',
        subscriptionScope: 'none',
        stripeSubscriptionId: null,
      },
    });
  });

  it('falls back to another org-covered membership', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      {
        organization: {
          plan: 'business',
          subscriptionStatus: 'active',
          stripeSubscriptionId: 'sub_other',
        },
      },
    ]);

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'business',
        stripeSubscriptionId: 'sub_other',
        subscriptionScope: 'organization',
      },
    });
  });

  it('fallback query filters by seatCoveredByOrg: true', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.organizationUser.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'zk-1',
        status: 'confirmed',
        seatCoveredByOrg: true,
      },
      include: { organization: true },
    });
  });

  it('does not modify individually-scoped members', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: 'com.deepterm.pro.monthly',
      webUser: {
        id: 'wu-1',
        plan: 'pro',
        subscriptionScope: 'individual',
        subscriptionSource: 'appstore',
        subscriptionExpiresAt: new Date(Date.now() + 86400000),
      },
    });

    await clearRemovedMemberPlan('zk-1');

    // subscriptionScope is 'individual', not 'organization', so no action
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    expect(mockPrisma.organizationUser.findMany).not.toHaveBeenCalled();
  });

  it('preserves Apple IAP subscription when no org fallback', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: 'com.deepterm.team.monthly',
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: 'appstore',
        subscriptionExpiresAt: futureDate,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([]);

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'team',
        subscriptionScope: 'individual',
        stripeSubscriptionId: null,
      },
    });
  });

  it('picks highest-ranked org from multiple fallback memberships', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      {
        organization: {
          plan: 'pro',
          subscriptionStatus: 'active',
          stripeSubscriptionId: 'sub_pro',
        },
      },
      {
        organization: {
          plan: 'enterprise',
          subscriptionStatus: 'active',
          stripeSubscriptionId: 'sub_ent',
        },
      },
      {
        organization: {
          plan: 'team',
          subscriptionStatus: 'active',
          stripeSubscriptionId: 'sub_team',
        },
      },
    ]);

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'enterprise',
        stripeSubscriptionId: 'sub_ent',
        subscriptionScope: 'organization',
      },
    });
  });

  it('ignores inactive org memberships in fallback search', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: {
        id: 'wu-1',
        plan: 'team',
        subscriptionScope: 'organization',
        subscriptionSource: null,
        subscriptionExpiresAt: null,
      },
    });
    mockPrisma.organizationUser.findMany.mockResolvedValue([
      {
        organization: {
          plan: 'business',
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: 'sub_canceled',
        },
      },
      {
        organization: {
          plan: 'free',
          subscriptionStatus: 'active',
          stripeSubscriptionId: null,
        },
      },
    ]);

    await clearRemovedMemberPlan('zk-1');

    // No valid fallback, should reset to free
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'wu-1' },
      data: {
        plan: 'free',
        subscriptionScope: 'none',
        stripeSubscriptionId: null,
      },
    });
  });

  it('does nothing when zkUser has no webUser', async () => {
    mockPrisma.zKUser.findUnique.mockResolvedValue({
      id: 'zk-1',
      appleProductId: null,
      webUser: null,
    });

    await clearRemovedMemberPlan('zk-1');

    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
