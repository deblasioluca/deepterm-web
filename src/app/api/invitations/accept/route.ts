import { NextRequest, NextResponse } from 'next/server';
import { auth as getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OrganizationUserStatus, createAuditLog, getClientIP } from '@/lib/zk';

/**
 * GET /api/invitations/accept?token=...
 * Look up an organization invitation by token (public, no auth required).
 * Used by the /invite/[token] page to display invitation details.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await prisma.organizationUser.findFirst({
      where: { token },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found or has been revoked' }, { status: 404 });
    }

    if (invitation.status !== 'invited') {
      return NextResponse.json({
        error: `This invitation has already been ${invitation.status}`,
        status: invitation.status,
      }, { status: 400 });
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    return NextResponse.json({
      email: invitation.invitedEmail,
      role: invitation.role,
      orgName: invitation.organization.name,
      orgId: invitation.organization.id,
      expiresAt: invitation.expiresAt,
      type: 'organization',
    });
  } catch (error) {
    console.error('Failed to look up org invitation:', error);
    return NextResponse.json(
      { error: 'Failed to look up invitation' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invitations/accept
 * Accept an organization invitation by token.
 * Requires the user to be signed in (via NextAuth session).
 * Links the OrganizationUser to the signed-in user's ZKUser account,
 * sets status to confirmed, and adds them to the default OrgTeam.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'You must be signed in to accept an invitation' },
        { status: 401 }
      );
    }

    const { token } = await request.json();

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invitation token is required' }, { status: 400 });
    }

    // Look up the invitation by token
    const invitation = await prisma.organizationUser.findFirst({
      where: { token },
      include: {
        organization: { select: { id: true, name: true } },
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or has been revoked' },
        { status: 404 }
      );
    }

    if (invitation.status !== 'invited') {
      return NextResponse.json(
        { error: `This invitation has already been ${invitation.status}` },
        { status: 400 }
      );
    }

    if (invitation.expiresAt && invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    const userEmail = session.user.email?.toLowerCase();
    if (!userEmail) {
      return NextResponse.json(
        { error: 'Your account does not have an email address. Cannot accept invitation.' },
        { status: 400 }
      );
    }

    // Find the signed-in user's ZKUser account
    const zkUser = await prisma.zKUser.findFirst({
      where: {
        email: userEmail,
      },
    });

    // Check the invited email matches the signed-in user
    if (invitation.invitedEmail && userEmail !== invitation.invitedEmail) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invitation.invitedEmail}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    if (!zkUser) {
      // The user has a NextAuth account but no ZKUser yet.
      // They need to log in through the app first to create their ZKUser with keypair.
      // For now, mark the invitation as "accepted pending ZK registration".
      return NextResponse.json(
        {
          error: 'Please log in through the DeepTerm app first to complete your account setup, then accept this invitation.',
          needsAppLogin: true,
        },
        { status: 422 }
      );
    }

    // Check if the user already has another OrganizationUser record in this org
    const existingMembership = await prisma.organizationUser.findFirst({
      where: {
        id: { not: invitation.id },
        userId: zkUser.id,
        organizationId: invitation.organizationId,
      },
    });

    if (existingMembership) {
      // Already has a record — delete the duplicate invitation and keep the existing one
      // Use a transaction to ensure atomicity
      await prisma.$transaction([
        prisma.organizationUser.delete({ where: { id: invitation.id } }),
        ...(existingMembership.status !== 'confirmed'
          ? [prisma.organizationUser.update({
              where: { id: existingMembership.id },
              data: { status: OrganizationUserStatus.CONFIRMED, confirmedAt: new Date(), token: null },
            })]
          : []),
      ]);
      return NextResponse.json({
        success: true,
        message: `You are already a member of ${invitation.organization.name}`,
        orgName: invitation.organization.name,
      });
    }

    // Link the invitation to the ZKUser and confirm
    await prisma.organizationUser.update({
      where: { id: invitation.id },
      data: {
        userId: zkUser.id,
        status: OrganizationUserStatus.CONFIRMED,
        confirmedAt: new Date(),
        token: null, // Clear the token after acceptance
      },
    });

    // Add user to the default OrgTeam if one exists
    const defaultTeam = await prisma.orgTeam.findFirst({
      where: {
        organizationId: invitation.organizationId,
        isDefault: true,
      },
    });

    if (defaultTeam) {
      const existingTeamMember = await prisma.orgTeamMember.findFirst({
        where: {
          teamId: defaultTeam.id,
          userId: zkUser.id,
        },
      });

      if (!existingTeamMember) {
        await prisma.orgTeamMember.create({
          data: {
            teamId: defaultTeam.id,
            userId: zkUser.id,
            role: invitation.role,
          },
        });
      }
    }

    // Audit log for invitation acceptance
    await createAuditLog({
      userId: zkUser.id,
      organizationId: invitation.organizationId,
      eventType: 'invitation_accepted',
      targetType: 'user',
      targetId: zkUser.id,
      ipAddress: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
    });

    return NextResponse.json({
      success: true,
      message: `You have joined ${invitation.organization.name}`,
      orgName: invitation.organization.name,
      role: invitation.role,
    });
  } catch (error) {
    console.error('Failed to accept org invitation:', error);
    return NextResponse.json(
      { error: 'Failed to accept invitation' },
      { status: 500 }
    );
  }
}
