import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserDefaults } from '@/lib/zk/ensure-user-defaults';

/**
 * POST /api/admin/backfill-users
 * Ensure every user has consistent data:
 *   1. Every web User with a passwordHash gets a linked ZKUser (same password)
 *   2. Every ZKUser gets a default org, team, and vault via ensureUserDefaults
 *   3. Every ZKUser without a webUserId gets linked to its web User (by email)
 *
 * Safe to run multiple times (idempotent).
 */
export async function POST() {
  try {
    const results: { email: string; created: string[] }[] = [];

    // ── Phase 1: Create ZKUser for web Users that don't have one ──────────
    const webUsersWithoutZK = await prisma.user.findMany({
      where: {
        passwordHash: { not: null },
        zkUser: null,
      },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    const phase1WebUserIds = new Set<string>();

    for (const webUser of webUsersWithoutZK) {
      // Re-use the same bcrypt hash so the login-password endpoint can verify
      const zkUser = await prisma.zKUser.create({
        data: {
          email: webUser.email.toLowerCase(),
          masterPasswordHash: webUser.passwordHash!,
          protectedSymmetricKey: '',
          publicKey: '',
          encryptedPrivateKey: '',
          webUserId: webUser.id,
        },
      });

      const displayName = webUser.name || webUser.email.split('@')[0];
      await ensureUserDefaults(zkUser.id, displayName);
      results.push({ email: webUser.email, created: ['zkUser', 'organization', 'team', 'vault'] });
      phase1WebUserIds.add(webUser.id);
    }

    // ── Phase 2: Ensure existing ZKUsers have default org/team/vault ──────
    const allZKUsers = await prisma.zKUser.findMany({
      select: { id: true, email: true, webUserId: true },
    });

    for (const zkUser of allZKUsers) {
      // Skip users just created in Phase 1
      if (zkUser.webUserId && phase1WebUserIds.has(zkUser.webUserId)) continue;

      const displayName = zkUser.email.split('@')[0];

      // Check what exists before
      const hadOrg = !!(await prisma.organizationUser.findFirst({
        where: { userId: zkUser.id, role: 'owner' },
      }));
      const hadTeam = hadOrg
        ? !!(await prisma.orgTeam.findFirst({
            where: {
              organization: { members: { some: { userId: zkUser.id, role: 'owner' } } },
              isDefault: true,
            },
          }))
        : false;
      const hadVault = !!(await prisma.zKVault.findFirst({
        where: { userId: zkUser.id, isDefault: true },
      }));

      await ensureUserDefaults(zkUser.id, displayName);

      const created: string[] = [];
      if (!hadOrg) created.push('organization');
      if (!hadTeam) created.push('team');
      if (!hadVault) created.push('vault');

      // Link ZKUser to web User if not linked yet
      if (!zkUser.webUserId) {
        const webUser = await prisma.user.findUnique({
          where: { email: zkUser.email.toLowerCase() },
        });
        if (webUser) {
          await prisma.zKUser.update({
            where: { id: zkUser.id },
            data: { webUserId: webUser.id },
          });
          created.push('webUserLink');
        }
      }

      if (created.length > 0) {
        results.push({ email: zkUser.email, created });
      }
    }

    return NextResponse.json({
      totalWebUsersBackfilled: webUsersWithoutZK.length,
      totalZKUsersChecked: allZKUsers.length,
      updated: results.length,
      details: results,
    });
  } catch (error) {
    console.error('Backfill error:', error);
    return NextResponse.json(
      { error: 'Backfill failed', details: String(error) },
      { status: 500 },
    );
  }
}
