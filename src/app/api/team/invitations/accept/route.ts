import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/team/invitations/accept
 * Accept a team invitation by token. Requires the user to be signed in.
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

    // Look up the invitation by token
    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: { team: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: 'Invitation not found or has been revoked' }, { status: 404 });
    }

    if (invitation.status !== 'pending') {
      return NextResponse.json({ error: `This invitation has already been ${invitation.status}` }, { status: 400 });
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    // Check the invited email matches the signed-in user
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invitation was sent to ${invitation.email}. Please sign in with that email address.` },
        { status: 403 }
      );
    }

    // Check if user is already on this team
    if (user.teamId === invitation.teamId) {
      // Mark invitation as accepted and return success
      await prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' },
      });
      return NextResponse.json({
        success: true,
        message: 'You are already a member of this team',
        teamName: invitation.team.name,
      });
    }

    // Add the user to the team
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          teamId: invitation.teamId,
          role: invitation.role,
        },
      }),
      prisma.teamInvitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted' },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: `You have joined ${invitation.team.name}`,
      teamName: invitation.team.name,
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
 * display team name / role before the user signs in.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    const invitation = await prisma.teamInvitation.findUnique({
      where: { token },
      include: { team: { select: { name: true } } },
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

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This invitation has expired' }, { status: 410 });
    }

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      teamName: invitation.team.name,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    console.error('Failed to look up invitation:', error);
    return NextResponse.json(
      { error: 'Failed to look up invitation' },
      { status: 500 }
    );
  }
}
