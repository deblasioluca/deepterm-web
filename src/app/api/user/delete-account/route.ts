import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { cascadeDeleteUser } from '@/lib/zk/cascade-delete-user';

/**
 * DELETE /api/user/delete-account
 * Session-based account deletion for web dashboard users.
 * Requires the user to be logged in via NextAuth session.
 */
export async function DELETE() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      );
    }

    const webUserId = session.user.id;

    const webUser = await prisma.user.findUnique({
      where: { id: webUserId },
    });

    if (!webUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      );
    }

    // Look up linked ZKUser
    const zkUser = await prisma.zKUser.findFirst({
      where: { webUserId },
    });

    // Cascade-delete ALL related data in a transaction
    await prisma.$transaction(async (tx) => {
      await cascadeDeleteUser(tx, {
        webUserId,
        zkUserId: zkUser?.id,
        userEmail: webUser.email,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete account:', error);
    return NextResponse.json(
      { error: 'Failed to delete account' },
      { status: 500 },
    );
  }
}
