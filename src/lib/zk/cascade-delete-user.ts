import { PrismaClient, Prisma } from '@prisma/client';

type TransactionClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

/**
 * Cascade-delete ALL data for a user (ZKUser + web User).
 *
 * Handles:
 *  - Collaboration data (shared sessions, chat, presences)
 *  - Vault data (items, vaults)
 *  - Audit logs, devices, refresh tokens
 *  - OrgTeamMember / OrganizationUser memberships
 *  - Sole-owner organizations (deleted entirely)
 *  - Dangling invitations by email
 *  - Web User data (votes, ideas, comments, sessions, notifications)
 *
 * All deletions are explicit (SQLite FK cascades are unreliable).
 *
 * @param tx  - Prisma transaction client
 * @param opts.webUserId - NextAuth User.id (optional; omit if deleting ZK-only user)
 * @param opts.zkUserId  - ZKUser.id (optional; omit if user never set up vault)
 * @param opts.userEmail - user email (used to clean up invitations)
 */
export async function cascadeDeleteUser(
  tx: TransactionClient,
  opts: { webUserId?: string; zkUserId?: string; userEmail: string },
) {
  const { webUserId, zkUserId, userEmail } = opts;
  const normalizedEmail = userEmail.toLowerCase();

  // ── ZKUser side ──────────────────────────────────────────────
  if (zkUserId) {
    // Collaboration data
    await tx.sharedSessionParticipant.deleteMany({ where: { userId: zkUserId } });

    // Delete participants of sessions this user owns (other users' participation records)
    const ownedSessions = await tx.sharedTerminalSession.findMany({
      where: { ownerId: zkUserId },
      select: { id: true },
    });
    if (ownedSessions.length > 0) {
      await tx.sharedSessionParticipant.deleteMany({
        where: { sessionId: { in: ownedSessions.map(s => s.id) } },
      });
    }
    await tx.sharedTerminalSession.deleteMany({ where: { ownerId: zkUserId } });
    await tx.chatFile.deleteMany({ where: { uploaderId: zkUserId } });
    await tx.chatMessage.deleteMany({ where: { senderId: zkUserId } });
    await tx.chatChannelParticipant.deleteMany({ where: { userId: zkUserId } });
    await tx.teamPresence.deleteMany({ where: { userId: zkUserId } });

    // Vault data
    await tx.zKVaultItem.deleteMany({ where: { userId: zkUserId } });
    await tx.zKVault.deleteMany({ where: { userId: zkUserId } });

    // Audit logs, devices, tokens
    await tx.zKAuditLog.deleteMany({ where: { userId: zkUserId } });
    await tx.device.deleteMany({ where: { userId: zkUserId } });
    await tx.refreshToken.deleteMany({ where: { userId: zkUserId } });

    // Team memberships
    await tx.orgTeamMember.deleteMany({
      where: { OR: [{ userId: zkUserId }, { invitedEmail: normalizedEmail }] },
    });

    // Sole-owner orgs → delete entirely
    const ownedMemberships = await tx.organizationUser.findMany({
      where: { userId: zkUserId, role: 'owner' },
      select: { organizationId: true },
    });

    for (const membership of ownedMemberships) {
      const orgId = membership.organizationId;
      const otherOwners = await tx.organizationUser.count({
        where: { organizationId: orgId, role: 'owner', userId: { not: zkUserId } },
      });

      if (otherOwners === 0) {
        await deleteOrganization(tx, orgId);
      }
    }

    // Remove remaining membership rows (non-sole-owner orgs)
    await tx.organizationUser.deleteMany({ where: { userId: zkUserId } });

    // Dangling email-only invitations
    await tx.organizationUser.deleteMany({ where: { invitedEmail: normalizedEmail, userId: null } });

    // Delete the ZKUser
    await tx.zKUser.delete({ where: { id: zkUserId } });
  } else {
    // No ZKUser — still clean up invitations by email
    await tx.organizationUser.deleteMany({ where: { invitedEmail: normalizedEmail, userId: null } });
    await tx.orgTeamMember.deleteMany({ where: { invitedEmail: normalizedEmail } });
  }

  // ── Web User side ────────────────────────────────────────────
  if (webUserId) {
    await tx.vote.deleteMany({ where: { userId: webUserId } });

    const userIdeas = await tx.idea.findMany({ where: { authorId: webUserId }, select: { id: true } });
    if (userIdeas.length > 0) {
      const ideaIds = userIdeas.map(i => i.id);
      await tx.vote.deleteMany({ where: { ideaId: { in: ideaIds } } });
      await tx.ideaComment.deleteMany({ where: { ideaId: { in: ideaIds } } });
    }
    await tx.idea.deleteMany({ where: { authorId: webUserId } });
    await tx.session.deleteMany({ where: { userId: webUserId } });
    await tx.userNotification.deleteMany({ where: { userId: webUserId } });

    // Delete the User (cascades Account, Passkey, Issue via onDelete:Cascade)
    await tx.user.delete({ where: { id: webUserId } });
  }
}

/**
 * Count the impact of deleting an organization (for confirmation UI).
 * Returns counts of all data that would be deleted.
 */
export async function getOrgDeleteImpact(
  tx: TransactionClient,
  orgId: string,
): Promise<{
  members: number;
  teams: number;
  vaults: number;
  vaultItems: number;
  chatMessages: number;
  sharedSessions: number;
  auditLogs: number;
}> {
  const [members, teams, vaults, vaultItems, chatMessages, sharedSessions, auditLogs] =
    await Promise.all([
      tx.organizationUser.count({ where: { organizationId: orgId } }),
      tx.orgTeam.count({ where: { organizationId: orgId } }),
      tx.zKVault.count({ where: { organizationId: orgId } }),
      tx.zKVaultItem.count({ where: { vault: { organizationId: orgId } } }),
      tx.chatMessage.count({
        where: { channel: { organizationId: orgId } },
      }),
      tx.sharedTerminalSession.count({ where: { organizationId: orgId } }),
      tx.zKAuditLog.count({ where: { organizationId: orgId } }),
    ]);

  return { members, teams, vaults, vaultItems, chatMessages, sharedSessions, auditLogs };
}

/**
 * Delete an entire Organization and all its children.
 * All deletions are explicit (SQLite FK cascades are unreliable).
 */
export async function deleteOrganization(tx: TransactionClient, orgId: string) {
  // OrgTeam children
  const orgTeams = await tx.orgTeam.findMany({ where: { organizationId: orgId }, select: { id: true } });
  for (const team of orgTeams) {
    await tx.orgTeamMember.deleteMany({ where: { teamId: team.id } });
  }
  await tx.orgTeam.deleteMany({ where: { organizationId: orgId } });

  // Vault data belonging to the org
  await tx.zKVaultItem.deleteMany({ where: { vault: { organizationId: orgId } } });
  await tx.zKVault.deleteMany({ where: { organizationId: orgId } });

  // Membership & presence
  await tx.organizationUser.deleteMany({ where: { organizationId: orgId } });
  await tx.teamPresence.deleteMany({ where: { organizationId: orgId } });

  // Chat
  await tx.chatFile.deleteMany({ where: { organizationId: orgId } });
  const orgChannels = await tx.chatChannel.findMany({ where: { organizationId: orgId }, select: { id: true } });
  for (const ch of orgChannels) {
    await tx.chatMessage.deleteMany({ where: { channelId: ch.id } });
    await tx.chatChannelParticipant.deleteMany({ where: { channelId: ch.id } });
  }
  await tx.chatChannel.deleteMany({ where: { organizationId: orgId } });

  // Shared sessions
  const orgSessions = await tx.sharedTerminalSession.findMany({ where: { organizationId: orgId }, select: { id: true } });
  if (orgSessions.length > 0) {
    await tx.sharedSessionParticipant.deleteMany({ where: { sessionId: { in: orgSessions.map(s => s.id) } } });
  }
  await tx.sharedTerminalSession.deleteMany({ where: { organizationId: orgId } });

  // Billing
  await tx.invoice.deleteMany({ where: { organizationId: orgId } });
  await tx.paymentMethod.deleteMany({ where: { organizationId: orgId } });

  // Audit
  await tx.zKAuditLog.deleteMany({ where: { organizationId: orgId } });

  // Finally the org itself
  await tx.organization.delete({ where: { id: orgId } });
}
