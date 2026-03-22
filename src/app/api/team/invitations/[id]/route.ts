import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// DELETE - Cancel/revoke invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const invitationId = params.id;

    // Get the current user and find their organization
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!currentUser?.zkUser) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    const currentMembership = await prisma.organizationUser.findFirst({
      where: { userId: currentUser.zkUser.id, status: 'confirmed' },
    });

    if (!currentMembership) {
      return NextResponse.json({ error: 'You are not part of an organization' }, { status: 400 });
    }

    if (currentMembership.role !== 'owner' && currentMembership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can cancel invitations' },
        { status: 403 }
      );
    }

    // Get the invitation (pending OrganizationUser)
    const invitation = await prisma.organizationUser.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.organizationId !== currentMembership.organizationId || invitation.status !== 'pending') {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Delete the pending invitation
    await prisma.organizationUser.delete({
      where: { id: invitationId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to cancel invitation:', error);
    return NextResponse.json(
      { error: 'Failed to cancel invitation' },
      { status: 500 }
    );
  }
}
