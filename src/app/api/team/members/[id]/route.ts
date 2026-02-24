import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// PATCH - Update member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberId = params.id;
    const { role } = await request.json();

    if (!role || !['admin', 'member'].includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be "admin" or "member"' },
        { status: 400 }
      );
    }

    // Get the current user and check permissions
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!currentUser?.teamId) {
      return NextResponse.json({ error: 'You are not part of a team' }, { status: 400 });
    }

    if (currentUser.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only team owners can change member roles' },
        { status: 403 }
      );
    }

    // Get the member to update
    const member = await prisma.user.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== currentUser.teamId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the role of the team owner' },
        { status: 400 }
      );
    }

    // Update the role
    const updatedMember = await prisma.user.update({
      where: { id: memberId },
      data: { role },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });

    return NextResponse.json({
      success: true,
      member: updatedMember,
    });
  } catch (error) {
    console.error('Failed to update member:', error);
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    );
  }
}

// DELETE - Remove member from team
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memberId = params.id;

    // Get the current user and check permissions
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!currentUser?.teamId) {
      return NextResponse.json({ error: 'You are not part of a team' }, { status: 400 });
    }

    // Check if user can remove members (owner or admin, or removing self)
    const canRemove =
      currentUser.role === 'owner' ||
      currentUser.role === 'admin' ||
      currentUser.id === memberId;

    if (!canRemove) {
      return NextResponse.json(
        { error: 'You do not have permission to remove this member' },
        { status: 403 }
      );
    }

    // Get the member to remove
    const member = await prisma.user.findUnique({
      where: { id: memberId },
    });

    if (!member || member.teamId !== currentUser.teamId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the team owner' },
        { status: 400 }
      );
    }

    // Remove member from team (don't delete user, just unlink from team)
    await prisma.user.update({
      where: { id: memberId },
      data: {
        teamId: null,
        role: 'member', // Reset role
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to remove member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}
