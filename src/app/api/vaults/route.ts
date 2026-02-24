import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - List user's ZK vaults (E2E encrypted)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find the linked ZK user
    const zkUser = await prisma.zKUser.findUnique({
      where: { webUserId: session.user.id },
      select: { id: true, email: true },
    });

    if (!zkUser) {
      return NextResponse.json({ vaults: [] });
    }

    // Get ZK user's org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: zkUser.id, status: 'confirmed' },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map((ou) => ou.organizationId);

    // Fetch ZK vaults (personal + org)
    const zkVaultRecords = await prisma.zKVault.findMany({
      where: {
        OR: [
          { userId: zkUser.id },
          ...(orgIds.length > 0 ? [{ organizationId: { in: orgIds } }] : []),
        ],
      },
      include: {
        items: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
        },
        organization: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const vaults = zkVaultRecords.map((v) => ({
      id: v.id,
      name: v.name || (v.isDefault ? 'Default Vault' : 'ZK Vault'),
      type: v.organizationId ? 'team' : 'personal',
      source: 'zk' as const,
      ownerId: zkUser.id,
      ownerName: zkUser.email,
      teamId: v.organizationId,
      isOwner: v.userId === zkUser.id,
      credentials: v.items.map((item) => ({
        id: item.id,
        encrypted: true,
        createdAt: item.createdAt,
      })),
      createdAt: v.createdAt,
    }));

    return NextResponse.json({ vaults });
  } catch (error) {
    console.error('Failed to fetch vaults:', error);
    return NextResponse.json(
      { error: 'Failed to fetch vaults' },
      { status: 500 }
    );
  }
}
