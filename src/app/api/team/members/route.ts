import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { sendTeamInvitationEmail } from '@/lib/email';
import crypto from 'crypto';

// GET - List organization members and pending invitations
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!user?.zkUser) {
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

    // Find user's organization membership
    const membership = await prisma.organizationUser.findFirst({
      where: { userId: user.zkUser.id, status: 'active' },
      include: {
        organization: {
          include: {
            members: {
              where: { status: 'active' },
              include: { user: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });

    if (!membership?.organization) {
      return NextResponse.json({
        members: [{
          id: user.id,
          name: user.name,
          email: user.email,
          role: 'owner',
          status: 'active',
          joinedAt: user.createdAt,
        }],
        invitations: [],
        isOwner: true,
      });
    }

    const org = membership.organization;

    // Get pending invitations from OrganizationUser with status 'pending'
    const pendingInvites = await prisma.organizationUser.findMany({
      where: {
        organizationId: org.id,
        status: 'pending',
      },
      include: { user: true },
      orderBy: { createdAt: 'desc' },
    });

    const isOwner = membership.role === 'owner';
    const isAdmin = membership.role === 'admin' || isOwner;

    return NextResponse.json({
      members: org.members.map((m) => ({
        id: m.id,
        name: m.user?.email || 'Unknown',
        email: m.user?.email || '',
        role: m.role,
        status: 'active',
        joinedAt: m.createdAt,
      })),
      invitations: pendingInvites.map((i) => ({
        id: i.id,
        email: i.user?.email || i.invitedEmail || '',
        role: i.role,
        status: 'pending',
        createdAt: i.createdAt,
        expiresAt: null,
      })),
      isOwner,
      isAdmin,
      teamId: org.id,
      teamName: org.name,
    });
  } catch (error) {
    console.error('Failed to fetch team members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team members' },
      { status: 500 }
    );
  }
}

// POST - Invite a new member to the organization
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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { zkUser: true },
    });

    if (!user?.zkUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find user's organization membership
    const membership = await prisma.organizationUser.findFirst({
      where: { userId: user.zkUser.id, status: 'active' },
      include: { organization: true },
    });

    if (!membership?.organization) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    // Check if user can invite (must be owner or admin)
    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only owners and admins can invite members' },
        { status: 403 }
      );
    }

    const org = membership.organization;

    // Check if email is already a member
    const existingZkUser = await prisma.zKUser.findFirst({
      where: { email },
    });

    if (existingZkUser) {
      const existingMembership = await prisma.organizationUser.findFirst({
        where: {
          organizationId: org.id,
          userId: existingZkUser.id,
          status: { in: ['active', 'pending'] },
        },
      });

      if (existingMembership) {
        const msg = existingMembership.status === 'active'
          ? 'This user is already an organization member'
          : 'An invitation has already been sent to this email';
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // Create invitation token
    const token = crypto.randomBytes(32).toString('hex');

    // Create a pending OrganizationUser record so the token can be found on acceptance
    if (existingZkUser) {
      await prisma.organizationUser.create({
        data: {
          organizationId: org.id,
          userId: existingZkUser.id,
          role: role || 'member',
          status: 'pending',
          token,
          invitedEmail: email,
        },
      });
    } else {
      // User doesn't have a ZK account yet — store invitation with invitedEmail
      await prisma.organizationUser.create({
        data: {
          organizationId: org.id,
          role: role || 'member',
          status: 'pending',
          token,
          invitedEmail: email,
        },
      });
    }

    // Send invitation email
    await sendTeamInvitationEmail({
      email,
      teamName: org.name,
      inviterName: user.name || 'A team member',
      token,
    });

    return NextResponse.json({
      success: true,
      invitation: {
        email,
        role: role || 'member',
        status: 'pending',
        createdAt: new Date(),
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
