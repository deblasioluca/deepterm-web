import { prisma } from '@/lib/prisma';

/**
 * Ensure a ZKUser has a default Organization, OrgTeam ("General"), and personal ZKVault.
 * This is idempotent — it will only create what's missing.
 *
 * Called from:
 *   - POST /api/zk/accounts/register  (password registration)
 *   - POST /api/zk/accounts/login-oauth (OAuth login — first time)
 *   - POST /api/admin/backfill-users   (admin one-shot backfill)
 */
export async function ensureUserDefaults(
  zkUserId: string,
  displayName: string,
): Promise<{ orgId: string; teamId: string; vaultId: string }> {
  // 0. Normalize any 'active' memberships to 'confirmed' for this user.
  //    The 'active' status is not a valid OrganizationUserStatus and causes
  //    memberships to be invisible in the dashboard (which filters by
  //    'confirmed' | 'invited' only).
  await prisma.organizationUser.updateMany({
    where: { userId: zkUserId, status: 'active' },
    data: { status: 'confirmed' },
  });

  // 1. Find or create the user's personal Organization
  const orgMembership = await prisma.organizationUser.findFirst({
    where: { userId: zkUserId, role: 'owner' },
  });

  let orgId: string;
  if (orgMembership) {
    orgId = orgMembership.organizationId;
  } else {
    const org = await prisma.organization.create({
      data: {
        name: `${displayName}'s Organization`,
        plan: 'starter',
        seats: 1,
      },
    });
    orgId = org.id;

    await prisma.organizationUser.create({
      data: {
        organizationId: orgId,
        userId: zkUserId,
        role: 'owner',
        status: 'confirmed',
      },
    });
  }

  // 2. Find or create the default "General" OrgTeam
  let defaultTeam = await prisma.orgTeam.findFirst({
    where: { organizationId: orgId, isDefault: true },
  });

  if (!defaultTeam) {
    defaultTeam = await prisma.orgTeam.create({
      data: {
        organizationId: orgId,
        name: 'General',
        description: 'Default team for all organization members',
        ownerId: zkUserId,
        isDefault: true,
      },
    });
  }

  const teamId = defaultTeam.id;

  // Ensure user is a member of the default team
  const existingTeamMember = await prisma.orgTeamMember.findFirst({
    where: { teamId, userId: zkUserId },
  });
  if (!existingTeamMember) {
    await prisma.orgTeamMember.create({
      data: {
        teamId,
        userId: zkUserId,
        role: 'owner',
      },
    });
  }

  // 3. Find or create the default personal ZKVault
  let defaultVault = await prisma.zKVault.findFirst({
    where: { userId: zkUserId, isDefault: true },
  });

  if (!defaultVault) {
    defaultVault = await prisma.zKVault.create({
      data: {
        userId: zkUserId,
        name: '',
        isDefault: true,
      },
    });
  }

  return { orgId, teamId, vaultId: defaultVault.id };
}
