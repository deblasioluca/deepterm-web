import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendTeamInvitationEmail } from '@/lib/email';
import crypto from 'crypto';

// GET - List team members and pending invitations
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the user's team
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user?.teamId) {
      // User has no team - return empty with user as potential owner
      return NextResponse.json({
        members: [{
          id: user?.id,
          name: user?.name,
          email: user?.email,
          role: 'owner',
          status: 'active',
          joinedAt: user?.createdAt,
        }],
        invitations: [],
        isOwner: true,
      });
    }

    // Get team members
    const members = await prisma.user.findMany({
      where: { teamId: user.teamId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get pending invitations
    const invitations = await prisma.teamInvitation.findMany({
      where: {
        teamId: user.teamId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const isOwner = user.role === 'owner';
    const isAdmin = user.role === 'admin' || isOwner;

    return NextResponse.json({
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: 'active',
        joinedAt: m.createdAt,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: 'pending',
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
      })),
      isOwner,
      isAdmin,
      teamId: user.teamId,
      teamName: user.team?.name,
    });
  } catch (error) {
    console.error('Failed to fetch team members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}

// POST - Invite a new team member
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { email, role } = await request.json();

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Get the user and check permissions
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { team: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if user can invite (must be owner or admin)
    if (user.role !== 'owner' && user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can invite members' },
        { status: 403 }
      );
    }

    let teamId = user.teamId;

    // If user has no team, create one
    if (!teamId) {
      const team = await prisma.team.create({
        data: {
          name: `${user.name}'s Team`,
          plan: 'starter',
        },
      });
      teamId = team.id;

      // Update user to be owner of the team
      await prisma.user.update({
        where: { id: user.id },
        data: { teamId: team.id, role: 'owner' },
      });
    }

    // Check if email is already a member
    const existingMember = await prisma.user.findFirst({
      where: {
        email,
        teamId,
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { error: 'This user is already a team member' },
        { status: 400 }
      );
    }

    // Check if there's already a pending invitation
    const existingInvitation = await prisma.teamInvitation.findFirst({
      where: {
        email,
        teamId,
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvitation) {
      return NextResponse.json(
        { error: 'An invitation has already been sent to this email' },
        { status: 400 }
      );
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await prisma.teamInvitation.create({
      data: {
        email,
        teamId,
        role: role || 'member',
        token,
        invitedById: user.id,
        expiresAt,
      },
    });

    // Get team name for the email
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    // Send invitation email
    await sendTeamInvitationEmail({
      email,
      teamName: team?.name || 'the team',
      inviterName: user.name || 'A team member',
      token,
    });

    return NextResponse.json({
      success: true,
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: 'pending',
        createdAt: invitation.createdAt,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    console.error('Failed to invite member:', error);
    return NextResponse.json(
      { error: 'Failed to invite member' },
      { status: 500 }
    );
  }
}
