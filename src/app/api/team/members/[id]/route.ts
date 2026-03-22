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

    // Get the current user and find their organization
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!currentUser?.zkUser) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    const currentMembership = await prisma.organizationUser.findFirst({
      where: { userId: currentUser.zkUser.id, status: 'active' },
    });

    if (!currentMembership) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    if (currentMembership.role !== 'owner') {
      return NextResponse.json(
        { error: 'Only organization owners can change member roles' },
        { status: 403 }
      );
    }

    // Get the member to update (memberId is the OrganizationUser id)
    const member = await prisma.organizationUser.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!member || member.organizationId !== currentMembership.organizationId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot change the role of the organization owner' },
        { status: 400 }
      );
    }

    // Update the role
    const updatedMember = await prisma.organizationUser.update({
      where: { id: memberId },
      data: { role },
      include: { user: true },
    });

    return NextResponse.json({
      success: true,
      member: {
        id: updatedMember.id,
        name: updatedMember.user?.email || 'Unknown',
        email: updatedMember.user?.email || '',
        role: updatedMember.role,
      },
    });
  } catch (error) {
    console.error('Failed to update member:', error);
    return NextResponse.json(
      { error: 'Failed to update member' },
      { status: 500 }
    );
  }
}

// DELETE - Remove member from organization
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

    // Get the current user and find their organization
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!currentUser?.zkUser) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    const currentMembership = await prisma.organizationUser.findFirst({
      where: { userId: currentUser.zkUser.id, status: 'active' },
    });

    if (!currentMembership) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    // Check if user can remove members (owner or admin, or removing self)
    const canRemove =
      currentMembership.role === 'owner' ||
      currentMembership.role === 'admin' ||
      currentMembership.id === memberId;

    if (!canRemove) {
      return NextResponse.json(
        { error: 'You do not have permission to remove this member' },
        { status: 403 }
      );
    }

    // Get the member to remove
    const member = await prisma.organizationUser.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== currentMembership.organizationId) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    if (member.role === 'owner') {
      return NextResponse.json(
        { error: 'Cannot remove the organization owner' },
        { status: 400 }
      );
    }

    // Remove member from organization (set status to 'removed')
    await prisma.organizationUser.update({
      where: { id: memberId },
      data: { status: 'removed' },
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
