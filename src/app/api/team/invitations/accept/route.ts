import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/team/invitations/accept
 * Accept an organization invitation by token. Requires the user to be signed in.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'You must be signed in to accept an invitation' }, { status: 401 });
    }

    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    // Look up the invitation by token in OrganizationUser
    const invitation = await prisma.organizationUser.findFirst({
      where: { token },
      include: { organization: true, user: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found or has been revoked' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: `This invitation has already been ${invitation.status}` }, { status: 400 });
    }

    // Check the invited email matches the signed-in user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const invitedEmail = invitation.invitedEmail || invitation.user?.email;
    if (invitedEmail && user.email?.toLowerCase() !== invitedEmail.toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invitedEmail}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    // Check if user is already an active member
    if (user.zkUser) {
      const existingActive = await prisma.organizationUser.findFirst({
        where: {
          organizationId: invitation.organizationId,
          userId: user.zkUser.id,
          status: 'active',
        },
      });

      if (existingActive) {
        await prisma.organizationUser.update({
          where: { id: invitation.id },
          data: { status: 'accepted' },
        });
        return NextResponse.json({
          success: true,
          message: 'You are already a member of this organization',
          teamName: invitation.organization.name,
        });
      }
    }

    // Accept the invitation
    await prisma.organizationUser.update({
      where: { id: invitation.id },
      data: { status: 'active', token: null },
    });

    return NextResponse.json({
      success: true,
      message: `You have joined ${invitation.organization.name}`,
      teamName: invitation.organization.name,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Failed to accept invitation:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/team/invitations/accept?token=...
 * Look up invitation details (public, no auth required) so the page can
 * display organization name / role before the user signs in.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await prisma.organizationUser.findFirst({
      where: { token },
      include: { organization: { select: { name: true } }, user: { select: { email: true } } },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found or has been revoked' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({
        error: `This invitation has already been ${invitation.status}`,
        status: invitation.status,
      }, { status: 400 });
    }

    return NextResponse.json({
      email: invitation.user?.email || '',
      role: invitation.role,
      teamName: invitation.organization.name,
      expiresAt: null,
    });
  } catch (error) {
    console.error('Failed to look up invitation:', error);
    return NextResponse.json(
      { error: 'Failed to look up invitation' },
      { status: 500 }
    );
  }
}
