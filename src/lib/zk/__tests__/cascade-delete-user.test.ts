import { describe, it, expect, vi, beforeEach } from 'vitest';

import { cascadeDeleteUser, deleteOrganization, getOrgDeleteImpact } from '../cascade-delete-user';

// Build a mock transaction client with all the Prisma models used by cascadeDeleteUser
function createMockTx() {
  return {
    sharedSessionParticipant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    sharedTerminalSession: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chatFile: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    chatMessage: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    chatChannelParticipant: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    chatChannel: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    teamPresence: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    zKVaultItem: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    zKVault: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    zKAuditLog: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    device: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    refreshToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    orgTeamMember: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    orgTeam: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    organizationUser: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    zKUser: { delete: vi.fn().mockResolvedValue({}) },
    vote: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    idea: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    ideaComment: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    userNotification: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    user: { delete: vi.fn().mockResolvedValue({}) },
    organization: { delete: vi.fn().mockResolvedValue({}) },
    invoice: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    paymentMethod: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
}

type MockTx = ReturnType<typeof createMockTx>;

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// ZKUser deletion — collaboration & vault data
// ---------------------------------------------------------------------------

describe('cascadeDeleteUser — ZKUser side', () => {
  it('deletes collaboration data for ZKUser', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    expect(tx.sharedSessionParticipant.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
    expect(tx.chatMessage.deleteMany).toHaveBeenCalledWith({ where: { senderId: 'zk-1' } });
    expect(tx.chatChannelParticipant.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
    expect(tx.teamPresence.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
  });

  it('deletes vault items and vaults', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    expect(tx.zKVaultItem.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
    expect(tx.zKVault.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
  });

  it('deletes audit logs, devices, and tokens', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    expect(tx.zKAuditLog.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
    expect(tx.device.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
    expect(tx.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'zk-1' } });
  });

  it('deletes the ZKUser record', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    expect(tx.zKUser.delete).toHaveBeenCalledWith({ where: { id: 'zk-1' } });
  });

  it('deletes owned session participants before owned sessions', async () => {
    const tx = createMockTx();
    tx.sharedTerminalSession.findMany.mockResolvedValue([{ id: 'sess-1' }, { id: 'sess-2' }]);

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    // Should delete participants of owned sessions
    expect(tx.sharedSessionParticipant.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: { in: ['sess-1', 'sess-2'] } },
    });
    expect(tx.sharedTerminalSession.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: 'zk-1' },
    });
  });
});

// ---------------------------------------------------------------------------
// Sole-owner org deletion
// ---------------------------------------------------------------------------

describe('cascadeDeleteUser — sole-owner org cascade', () => {
  it('deletes entire org when user is sole owner', async () => {
    const tx = createMockTx();

    // User owns one org
    tx.organizationUser.findMany.mockResolvedValue([{ organizationId: 'org-1' }]);
    // No other owners
    tx.organizationUser.count.mockResolvedValue(0);

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    // Org and all children should be deleted
    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: 'org-1' } });
    expect(tx.orgTeam.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
    expect(tx.invoice.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
    expect(tx.paymentMethod.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-1' } });
  });

  it('does NOT delete org when other owners exist', async () => {
    const tx = createMockTx();

    tx.organizationUser.findMany.mockResolvedValue([{ organizationId: 'org-1' }]);
    // One other owner exists
    tx.organizationUser.count.mockResolvedValue(1);

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    // Org should NOT be deleted
    expect(tx.organization.delete).not.toHaveBeenCalled();
    // But membership should still be removed
    expect(tx.organizationUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'zk-1' },
    });
  });

  it('deletes org team members when org is deleted', async () => {
    const tx = createMockTx();

    tx.organizationUser.findMany.mockResolvedValue([{ organizationId: 'org-1' }]);
    tx.organizationUser.count.mockResolvedValue(0); // sole owner
    tx.orgTeam.findMany.mockResolvedValue([{ id: 'team-1' }, { id: 'team-2' }]);

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    // Team members should be deleted for each team
    expect(tx.orgTeamMember.deleteMany).toHaveBeenCalledWith({ where: { teamId: 'team-1' } });
    expect(tx.orgTeamMember.deleteMany).toHaveBeenCalledWith({ where: { teamId: 'team-2' } });
  });
});

// ---------------------------------------------------------------------------
// Email-only invitation cleanup
// ---------------------------------------------------------------------------

describe('cascadeDeleteUser — invitation cleanup', () => {
  it('cleans up dangling email-only org invitations', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'Alice@Example.com',
    });

    expect(tx.organizationUser.deleteMany).toHaveBeenCalledWith({
      where: { invitedEmail: 'alice@example.com', userId: null },
    });
  });

  it('cleans up invitations when no ZKUser exists', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      userEmail: 'Alice@Example.com',
    });

    // Should still clean up email-based invitations
    expect(tx.organizationUser.deleteMany).toHaveBeenCalledWith({
      where: { invitedEmail: 'alice@example.com', userId: null },
    });
    expect(tx.orgTeamMember.deleteMany).toHaveBeenCalledWith({
      where: { invitedEmail: 'alice@example.com' },
    });
    // Should NOT try to delete ZKUser
    expect(tx.zKUser.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Web User side
// ---------------------------------------------------------------------------

describe('cascadeDeleteUser — web User side', () => {
  it('deletes web user data (votes, ideas, comments, sessions, notifications)', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      webUserId: 'web-1',
      userEmail: 'a@b.com',
    });

    expect(tx.vote.deleteMany).toHaveBeenCalledWith({ where: { userId: 'web-1' } });
    expect(tx.idea.deleteMany).toHaveBeenCalledWith({ where: { authorId: 'web-1' } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'web-1' } });
    expect(tx.userNotification.deleteMany).toHaveBeenCalledWith({ where: { userId: 'web-1' } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'web-1' } });
  });

  it('deletes votes and comments on user ideas before deleting ideas', async () => {
    const tx = createMockTx();
    tx.idea.findMany.mockResolvedValue([{ id: 'idea-1' }, { id: 'idea-2' }]);

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      webUserId: 'web-1',
      userEmail: 'a@b.com',
    });

    expect(tx.vote.deleteMany).toHaveBeenCalledWith({
      where: { ideaId: { in: ['idea-1', 'idea-2'] } },
    });
    expect(tx.ideaComment.deleteMany).toHaveBeenCalledWith({
      where: { ideaId: { in: ['idea-1', 'idea-2'] } },
    });
  });

  it('does NOT delete web user when webUserId is not provided', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      userEmail: 'a@b.com',
    });

    expect(tx.user.delete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Full cascade — both ZKUser + web User
// ---------------------------------------------------------------------------

describe('cascadeDeleteUser — full cascade', () => {
  it('handles both ZKUser and web User deletion', async () => {
    const tx = createMockTx();

    await cascadeDeleteUser(tx as unknown as Parameters<typeof cascadeDeleteUser>[0], {
      zkUserId: 'zk-1',
      webUserId: 'web-1',
      userEmail: 'a@b.com',
    });

    // Both ZKUser and web User should be deleted
    expect(tx.zKUser.delete).toHaveBeenCalledWith({ where: { id: 'zk-1' } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'web-1' } });
  });
});

// ---------------------------------------------------------------------------
// deleteOrganization (exported for reuse across endpoints)
// ---------------------------------------------------------------------------

function createOrgMockTx() {
  const base = createMockTx();
  // Add count mocks needed by getOrgDeleteImpact
  return {
    ...base,
    organizationUser: {
      ...base.organizationUser,
      count: vi.fn().mockResolvedValue(3),
    },
    orgTeam: {
      ...base.orgTeam,
      count: vi.fn().mockResolvedValue(2),
    },
    zKVault: {
      ...base.zKVault,
      count: vi.fn().mockResolvedValue(1),
    },
    zKVaultItem: {
      ...base.zKVaultItem,
      count: vi.fn().mockResolvedValue(10),
    },
    chatMessage: {
      ...base.chatMessage,
      count: vi.fn().mockResolvedValue(5),
    },
    sharedTerminalSession: {
      ...base.sharedTerminalSession,
      count: vi.fn().mockResolvedValue(2),
    },
    zKAuditLog: {
      ...base.zKAuditLog,
      count: vi.fn().mockResolvedValue(20),
    },
  };
}

describe('deleteOrganization — explicit cascade', () => {
  it('deletes all org children in correct order', async () => {
    const tx = createOrgMockTx();
    tx.orgTeam.findMany.mockResolvedValue([{ id: 'team-a' }]);
    tx.chatChannel.findMany.mockResolvedValue([{ id: 'ch-1' }]);
    tx.sharedTerminalSession.findMany.mockResolvedValue([{ id: 's-1' }]);

    await deleteOrganization(
      tx as unknown as Parameters<typeof deleteOrganization>[0],
      'org-99',
    );

    // Team children
    expect(tx.orgTeamMember.deleteMany).toHaveBeenCalledWith({ where: { teamId: 'team-a' } });
    expect(tx.orgTeam.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Vault data
    expect(tx.zKVaultItem.deleteMany).toHaveBeenCalledWith({ where: { vault: { organizationId: 'org-99' } } });
    expect(tx.zKVault.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Memberships & presence
    expect(tx.organizationUser.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });
    expect(tx.teamPresence.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Chat
    expect(tx.chatFile.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });
    expect(tx.chatMessage.deleteMany).toHaveBeenCalledWith({ where: { channelId: 'ch-1' } });
    expect(tx.chatChannelParticipant.deleteMany).toHaveBeenCalledWith({ where: { channelId: 'ch-1' } });
    expect(tx.chatChannel.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Shared sessions
    expect(tx.sharedSessionParticipant.deleteMany).toHaveBeenCalledWith({ where: { sessionId: { in: ['s-1'] } } });
    expect(tx.sharedTerminalSession.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Billing
    expect(tx.invoice.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });
    expect(tx.paymentMethod.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Audit
    expect(tx.zKAuditLog.deleteMany).toHaveBeenCalledWith({ where: { organizationId: 'org-99' } });

    // Org itself
    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: 'org-99' } });
  });

  it('handles org with no children gracefully', async () => {
    const tx = createOrgMockTx();
    tx.orgTeam.findMany.mockResolvedValue([]);
    tx.chatChannel.findMany.mockResolvedValue([]);
    tx.sharedTerminalSession.findMany.mockResolvedValue([]);

    await deleteOrganization(
      tx as unknown as Parameters<typeof deleteOrganization>[0],
      'org-empty',
    );

    // Should still delete the org itself
    expect(tx.organization.delete).toHaveBeenCalledWith({ where: { id: 'org-empty' } });
    // Should NOT call sharedSessionParticipant.deleteMany (no sessions)
    expect(tx.sharedSessionParticipant.deleteMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getOrgDeleteImpact — pre-delete dry-run counts
// ---------------------------------------------------------------------------

describe('getOrgDeleteImpact — dry-run counts', () => {
  it('returns correct counts for all entity types', async () => {
    const tx = createOrgMockTx();

    const impact = await getOrgDeleteImpact(
      tx as unknown as Parameters<typeof getOrgDeleteImpact>[0],
      'org-42',
    );

    expect(impact).toEqual({
      members: 3,
      teams: 2,
      vaults: 1,
      vaultItems: 10,
      chatMessages: 5,
      sharedSessions: 2,
      auditLogs: 20,
    });

    // Verify correct where clauses
    expect(tx.organizationUser.count).toHaveBeenCalledWith({ where: { organizationId: 'org-42' } });
    expect(tx.orgTeam.count).toHaveBeenCalledWith({ where: { organizationId: 'org-42' } });
    expect(tx.zKVault.count).toHaveBeenCalledWith({ where: { organizationId: 'org-42' } });
    expect(tx.zKVaultItem.count).toHaveBeenCalledWith({ where: { vault: { organizationId: 'org-42' } } });
    expect(tx.sharedTerminalSession.count).toHaveBeenCalledWith({ where: { organizationId: 'org-42' } });
    expect(tx.zKAuditLog.count).toHaveBeenCalledWith({ where: { organizationId: 'org-42' } });
  });

  it('returns zeros for empty org', async () => {
    const tx = createOrgMockTx();
    // Override all counts to 0
    tx.organizationUser.count.mockResolvedValue(0);
    tx.orgTeam.count.mockResolvedValue(0);
    tx.zKVault.count.mockResolvedValue(0);
    tx.zKVaultItem.count.mockResolvedValue(0);
    tx.chatMessage.count.mockResolvedValue(0);
    tx.sharedTerminalSession.count.mockResolvedValue(0);
    tx.zKAuditLog.count.mockResolvedValue(0);

    const impact = await getOrgDeleteImpact(
      tx as unknown as Parameters<typeof getOrgDeleteImpact>[0],
      'org-empty',
    );

    expect(impact).toEqual({
      members: 0,
      teams: 0,
      vaults: 0,
      vaultItems: 0,
      chatMessages: 0,
      sharedSessions: 0,
      auditLogs: 0,
    });
  });
});
