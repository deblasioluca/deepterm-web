import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { cascadeDeleteUser } from '@/lib/zk/cascade-delete-user';

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

    // Delete user and ALL related data in a transaction
    await prisma.$transaction(async (tx) => {
      await cascadeDeleteUser(tx, {
        webUserId: id,
        zkUserId: zkUser?.id,
        userEmail: user.email,
      });
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
