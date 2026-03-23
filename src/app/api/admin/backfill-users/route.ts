import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureUserDefaults } from '@/lib/zk/ensure-user-defaults';

/**
 * POST /api/admin/backfill-users
 * One-shot backfill: ensure every ZKUser has a default org, team, and vault.
 * Safe to run multiple times (idempotent).
 */
export async function POST() {
  try {
    const allUsers = await prisma.zKUser.findMany({
      select: { id: true, email: true },
    });

    const results: { email: string; created: string[] }[] = [];

    for (const user of allUsers) {
      const displayName = user.email.split('@')[0];

      // Check what exists before
      const hadOrg = !!(await prisma.organizationUser.findFirst({
        where: { userId: user.id, role: 'owner' },
      }));
      const hadTeam = hadOrg
        ? !!(await prisma.orgTeam.findFirst({
            where: {
              organization: { members: { some: { userId: user.id, role: 'owner' } } },
              isDefault: true,
            },
          }))
        : false;
      const hadVault = !!(await prisma.zKVault.findFirst({
        where: { userId: user.id, isDefault: true },
      }));

      await ensureUserDefaults(user.id, displayName);

      const created: string[] = [];
      if (!hadOrg) created.push('organization');
      if (!hadTeam) created.push('team');
      if (!hadVault) created.push('vault');

      if (created.length > 0) {
        results.push({ email: user.email, created });
      }
    }

    return NextResponse.json({
      total: allUsers.length,
      updated: results.length,
      skipped: allUsers.length - results.length,
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
