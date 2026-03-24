import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    organizationUser: { findFirst: vi.fn(), create: vi.fn() },
    organization: { create: vi.fn() },
    orgTeam: { findFirst: vi.fn(), create: vi.fn() },
    orgTeamMember: { findFirst: vi.fn(), create: vi.fn() },
    zKVault: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

import { ensureUserDefaults } from '../ensure-user-defaults';
import { prisma } from '@/lib/prisma';

const mockPrisma = prisma as unknown as {
  organizationUser: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  organization: { create: ReturnType<typeof vi.fn> };
  orgTeam: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  orgTeamMember: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  zKVault: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ensureUserDefaults — creates everything from scratch
// ---------------------------------------------------------------------------

describe('ensureUserDefaults', () => {
  it('creates org, team, team membership, and vault for new user', async () => {
    // No existing org membership
    mockPrisma.organizationUser.findFirst.mockResolvedValue(null);
    // Create org
    mockPrisma.organization.create.mockResolvedValue({ id: 'org-1' });
    // Create org membership
    mockPrisma.organizationUser.create.mockResolvedValue({ id: 'ou-1' });
    // No existing team
    mockPrisma.orgTeam.findFirst.mockResolvedValue(null);
    // Create team
    mockPrisma.orgTeam.create.mockResolvedValue({ id: 'team-1' });
    // No existing team member
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue(null);
    // Create team member
    mockPrisma.orgTeamMember.create.mockResolvedValue({ id: 'tm-1' });
    // No existing vault
    mockPrisma.zKVault.findFirst.mockResolvedValue(null);
    // Create vault
    mockPrisma.zKVault.create.mockResolvedValue({ id: 'vault-1' });

    const result = await ensureUserDefaults('user-1', 'Alice');
    expect(result).toEqual({ orgId: 'org-1', teamId: 'team-1', vaultId: 'vault-1' });

    // Verify org was created with correct name
    expect(mockPrisma.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Alice's Organization",
        plan: 'starter',
        seats: 1,
      }),
    });

    // Verify org membership with owner role
    expect(mockPrisma.organizationUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        role: 'owner',
        status: 'confirmed',
      }),
    });

    // Verify team was created with correct defaults
    expect(mockPrisma.orgTeam.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-1',
        name: 'General',
        isDefault: true,
        ownerId: 'user-1',
      }),
    });

    // Verify team member with owner role
    expect(mockPrisma.orgTeamMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        teamId: 'team-1',
        userId: 'user-1',
        role: 'owner',
      }),
    });

    // Verify vault was created as default
    expect(mockPrisma.zKVault.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        name: '',
        isDefault: true,
      }),
    });
  });

  it('reuses existing org when user already owns one', async () => {
    // Existing org membership
    mockPrisma.organizationUser.findFirst.mockResolvedValue({
      organizationId: 'existing-org',
    });
    // No existing team
    mockPrisma.orgTeam.findFirst.mockResolvedValue(null);
    mockPrisma.orgTeam.create.mockResolvedValue({ id: 'team-2' });
    // No existing team member
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue(null);
    mockPrisma.orgTeamMember.create.mockResolvedValue({ id: 'tm-2' });
    // No existing vault
    mockPrisma.zKVault.findFirst.mockResolvedValue(null);
    mockPrisma.zKVault.create.mockResolvedValue({ id: 'vault-2' });

    const result = await ensureUserDefaults('user-1', 'Alice');
    expect(result.orgId).toBe('existing-org');
    // Should NOT create a new org
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
  });

  it('reuses existing team when org already has default team', async () => {
    mockPrisma.organizationUser.findFirst.mockResolvedValue({
      organizationId: 'org-1',
    });
    // Existing default team
    mockPrisma.orgTeam.findFirst.mockResolvedValue({ id: 'existing-team' });
    // Existing team member
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue({ id: 'tm-1' });
    // No existing vault
    mockPrisma.zKVault.findFirst.mockResolvedValue(null);
    mockPrisma.zKVault.create.mockResolvedValue({ id: 'vault-3' });

    const result = await ensureUserDefaults('user-1', 'Alice');
    expect(result.teamId).toBe('existing-team');
    expect(mockPrisma.orgTeam.create).not.toHaveBeenCalled();
    expect(mockPrisma.orgTeamMember.create).not.toHaveBeenCalled();
  });

  it('reuses existing vault when user already has default vault', async () => {
    mockPrisma.organizationUser.findFirst.mockResolvedValue({
      organizationId: 'org-1',
    });
    mockPrisma.orgTeam.findFirst.mockResolvedValue({ id: 'team-1' });
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue({ id: 'tm-1' });
    // Existing default vault
    mockPrisma.zKVault.findFirst.mockResolvedValue({ id: 'existing-vault' });

    const result = await ensureUserDefaults('user-1', 'Alice');
    expect(result.vaultId).toBe('existing-vault');
    expect(mockPrisma.zKVault.create).not.toHaveBeenCalled();
  });

  it('is idempotent — calling twice returns same IDs', async () => {
    // First call: everything exists
    mockPrisma.organizationUser.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    mockPrisma.orgTeam.findFirst.mockResolvedValue({ id: 'team-1' });
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue({ id: 'tm-1' });
    mockPrisma.zKVault.findFirst.mockResolvedValue({ id: 'vault-1' });

    const result1 = await ensureUserDefaults('user-1', 'Alice');
    const result2 = await ensureUserDefaults('user-1', 'Alice');

    expect(result1).toEqual(result2);
    expect(mockPrisma.organization.create).not.toHaveBeenCalled();
    expect(mockPrisma.orgTeam.create).not.toHaveBeenCalled();
    expect(mockPrisma.zKVault.create).not.toHaveBeenCalled();
  });

  it('adds user to team if not already a member', async () => {
    mockPrisma.organizationUser.findFirst.mockResolvedValue({ organizationId: 'org-1' });
    mockPrisma.orgTeam.findFirst.mockResolvedValue({ id: 'team-1' });
    // Not a member yet
    mockPrisma.orgTeamMember.findFirst.mockResolvedValue(null);
    mockPrisma.orgTeamMember.create.mockResolvedValue({ id: 'tm-new' });
    mockPrisma.zKVault.findFirst.mockResolvedValue({ id: 'vault-1' });

    await ensureUserDefaults('user-1', 'Alice');
    expect(mockPrisma.orgTeamMember.create).toHaveBeenCalledOnce();
  });
});
