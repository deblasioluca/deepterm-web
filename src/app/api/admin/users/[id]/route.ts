import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// GET - Get a single user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        sessions: {
          select: { id: true, device: true, lastActive: true },
          orderBy: { lastActive: 'desc' },
          take: 10,
        },
        ideas: {
          select: { id: true, title: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        issues: {
          select: { id: true, title: true, status: true, area: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { ideas: true, votes: true, issues: true, passkeys: true, sessions: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Look up linked ZKUser
    const zkUser = await prisma.zKUser.findFirst({
      where: { webUserId: id },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { zkVaults: true, zkVaultItems: true, devices: true } },
      },
    });

    // Per-user vault item type breakdown
    let zkItemTypeCounts: Record<string, number> | null = null;
    if (zkUser) {
      const typeStats = await prisma.zKVaultItem.groupBy({
        by: ['type'],
        where: { userId: zkUser.id, deletedAt: null },
        _count: { id: true },
      });
      zkItemTypeCounts = { credentials: 0, managedKeys: 0, identities: 0, hostGroups: 0, unknown: 0 };
      for (const stat of typeStats) {
        const t = stat.type;
        if (t === null || t === undefined) zkItemTypeCounts.unknown += stat._count.id;
        else if (t <= 2) zkItemTypeCounts.credentials += stat._count.id;
        else if (t === 10) zkItemTypeCounts.managedKeys += stat._count.id;
        else if (t === 11) zkItemTypeCounts.identities += stat._count.id;
        else if (t === 12) zkItemTypeCounts.hostGroups += stat._count.id;
        else zkItemTypeCounts.unknown += stat._count.id;
      }
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      plan: (user as Record<string, unknown>).plan || 'free',
      twoFactorEnabled: (user as Record<string, unknown>).twoFactorEnabled || false,
      subscriptionSource: (user as Record<string, unknown>).subscriptionSource || null,
      subscriptionExpiresAt: (user as Record<string, unknown>).subscriptionExpiresAt || null,
      sessions: user.sessions,
      ideas: user.ideas,
      issues: user.issues,
      stats: {
        ideas: user._count.ideas,
        votes: user._count.votes,
        issues: user._count.issues,
        passkeys: user._count.passkeys,
        sessions: user._count.sessions,
      },
      zkUser,
      zkItemTypeCounts,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PATCH - Update a user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, password, role } = body;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check email uniqueness if changing
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a user and ALL related data (ZKUser, orgs, teams, vaults, memberships)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Look up linked ZKUser
    const zkUser = await prisma.zKUser.findFirst({
      where: { webUserId: id },
    });

    const userEmail = user.email.toLowerCase();

    // Delete user and ALL related data in a transaction
    await prisma.$transaction(async (tx) => {
      if (zkUser) {
        const zkUserId = zkUser.id;

        // --- Collaboration data (references ZKUser) ---
        await tx.sharedSessionParticipant.deleteMany({ where: { userId: zkUserId } });
        await tx.sharedTerminalSession.deleteMany({ where: { ownerId: zkUserId } });
        await tx.chatFile.deleteMany({ where: { uploaderId: zkUserId } });
        await tx.chatMessage.deleteMany({ where: { senderId: zkUserId } });
        await tx.chatChannelParticipant.deleteMany({ where: { userId: zkUserId } });
        await tx.teamPresence.deleteMany({ where: { userId: zkUserId } });

        // --- Vault data ---
        await tx.zKVaultItem.deleteMany({ where: { userId: zkUserId } });
        // Delete personal vaults (owned by this user, not org-level)
        await tx.zKVault.deleteMany({ where: { userId: zkUserId } });

        // --- Audit logs ---
        await tx.zKAuditLog.deleteMany({ where: { userId: zkUserId } });

        // --- Device & token data ---
        await tx.device.deleteMany({ where: { userId: zkUserId } });
        await tx.refreshToken.deleteMany({ where: { userId: zkUserId } });

        // --- Team memberships (OrgTeamMember) ---
        await tx.orgTeamMember.deleteMany({
          where: { OR: [{ userId: zkUserId }, { invitedEmail: userEmail }] },
        });

        // --- Find orgs where user is sole owner → delete those entirely ---
        const ownedMemberships = await tx.organizationUser.findMany({
          where: { userId: zkUserId, role: 'owner' },
          select: { organizationId: true },
        });

        for (const membership of ownedMemberships) {
          const orgId = membership.organizationId;
          // Count other owners in this org
          const otherOwners = await tx.organizationUser.count({
            where: { organizationId: orgId, role: 'owner', userId: { not: zkUserId } },
          });

          if (otherOwners === 0) {
            // User is sole owner → delete the entire org (cascades to OrgTeam, members, vaults, etc.)
            // First clean up children that might not cascade in SQLite
            const orgTeams = await tx.orgTeam.findMany({ where: { organizationId: orgId }, select: { id: true } });
            for (const team of orgTeams) {
              await tx.orgTeamMember.deleteMany({ where: { teamId: team.id } });
            }
            await tx.orgTeam.deleteMany({ where: { organizationId: orgId } });
            await tx.zKVaultItem.deleteMany({
              where: { vault: { organizationId: orgId } },
            });
            await tx.zKVault.deleteMany({ where: { organizationId: orgId } });
            await tx.organizationUser.deleteMany({ where: { organizationId: orgId } });
            await tx.teamPresence.deleteMany({ where: { organizationId: orgId } });
            await tx.chatFile.deleteMany({ where: { organizationId: orgId } });
            // Delete chat messages via channels
            const orgChannels = await tx.chatChannel.findMany({ where: { organizationId: orgId }, select: { id: true } });
            for (const ch of orgChannels) {
              await tx.chatMessage.deleteMany({ where: { channelId: ch.id } });
              await tx.chatChannelParticipant.deleteMany({ where: { channelId: ch.id } });
            }
            await tx.chatChannel.deleteMany({ where: { organizationId: orgId } });
            await tx.sharedTerminalSession.deleteMany({ where: { organizationId: orgId } });
            await tx.invoice.deleteMany({ where: { organizationId: orgId } });
            await tx.paymentMethod.deleteMany({ where: { organizationId: orgId } });
            await tx.zKAuditLog.deleteMany({ where: { organizationId: orgId } });
            await tx.organization.delete({ where: { id: orgId } });
          }
        }

        // --- Remove membership rows for orgs user was NOT sole owner of ---
        await tx.organizationUser.deleteMany({ where: { userId: zkUserId } });

        // --- Remove any dangling invitations by email ---
        await tx.organizationUser.deleteMany({ where: { invitedEmail: userEmail, userId: null } });

        // --- Delete the ZKUser ---
        await tx.zKUser.delete({ where: { id: zkUserId } });
      } else {
        // No ZKUser — still clean up any org invitations by email
        await tx.organizationUser.deleteMany({ where: { invitedEmail: userEmail, userId: null } });
        await tx.orgTeamMember.deleteMany({ where: { invitedEmail: userEmail } });
      }

      // --- Web User data ---
      // Delete votes first (references ideas via FK)
      await tx.vote.deleteMany({ where: { userId: id } });
      // Delete idea comments before ideas
      const userIdeas = await tx.idea.findMany({ where: { authorId: id }, select: { id: true } });
      if (userIdeas.length > 0) {
        await tx.ideaComment.deleteMany({ where: { ideaId: { in: userIdeas.map(i => i.id) } } });
      }
      await tx.idea.deleteMany({ where: { authorId: id } });
      await tx.session.deleteMany({ where: { userId: id } });
      await tx.userNotification.deleteMany({ where: { userId: id } });

      // Finally delete the User (cascades Account, Passkey, Issue, etc.)
      await tx.user.delete({ where: { id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
