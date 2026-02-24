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

    // Get the current user and check permissions
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!currentUser?.teamId) {
      return NextResponse.json({ error: 'You are not part of a team' }, { status: 400 });
    }

    if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can cancel invitations' },
        { status: 403 }
      );
    }

    // Get the invitation
    const invitation = await prisma.teamInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.teamId !== currentUser.teamId) {
      return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
    }

    // Delete the invitation
    await prisma.teamInvitation.delete({
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
