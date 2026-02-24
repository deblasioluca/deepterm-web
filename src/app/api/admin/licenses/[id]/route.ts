import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

// Helper to verify admin session
async function verifyAdmin() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('admin-session')?.value;
  
  if (!sessionCookie) {
    return null;
  }

  try {
    const sessionData = JSON.parse(
      Buffer.from(sessionCookie, 'base64').toString('utf-8')
    );

    // Check if session is expired
    if (sessionData.exp && sessionData.exp < Date.now()) {
      return null;
    }

    const admin = await prisma.adminUser.findFirst({
      where: { 
        id: sessionData.id,
        isActive: true 
      },
    });

    return admin;
  } catch {
    return null;
  }
}

// GET - Get license details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'team';

    if (type === 'team') {
      const team = await prisma.team.findUnique({
        where: { id },
        include: {
          members: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
            },
          },
        },
      });

      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 });
      }

      return NextResponse.json({ license: team });
    } else {
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
          team: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      return NextResponse.json({ license: user });
    }
  } catch (error) {
    console.error('Failed to fetch license:', error);
    return NextResponse.json(
      { error: 'Failed to fetch license' },
      { status: 500 }
    );
  }
}

// PATCH - Update license
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { type, plan, seats, status, expiresAt, ssoEnabled } = await request.json();

    if (type === 'team') {
      const team = await prisma.team.findUnique({
        where: { id },
      });

      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};
      
      if (plan !== undefined) updateData.plan = plan;
      if (seats !== undefined) updateData.seats = seats;
      if (status !== undefined) updateData.subscriptionStatus = status;
      if (expiresAt !== undefined) updateData.currentPeriodEnd = expiresAt ? new Date(expiresAt) : null;
      if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;

      const updatedTeam = await prisma.team.update({
        where: { id },
        data: updateData,
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'license.updated',
          entityType: 'team',
          entityId: id,
          metadata: JSON.stringify(updateData),
        },
      });

      return NextResponse.json({
        success: true,
        license: updatedTeam,
      });
    } else if (type === 'user') {
      // For individual users, create a team if upgrading from free
      const user = await prisma.user.findUnique({
        where: { id },
      });

      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      if (!user.teamId && plan && plan !== 'free') {
        // Create a new team for this user
        const team = await prisma.team.create({
          data: {
            name: `${user.name}'s Team`,
            plan,
            seats: seats || 1,
            subscriptionStatus: status || 'active',
            currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
            ssoEnabled: ssoEnabled || plan === 'team' || plan === 'enterprise',
          },
        });

        await prisma.user.update({
          where: { id },
          data: { teamId: team.id, role: 'owner' },
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'license.upgraded',
            entityType: 'user',
            entityId: id,
            metadata: JSON.stringify({ teamId: team.id, plan }),
          },
        });

        return NextResponse.json({
          success: true,
          license: team,
          message: 'Created new team for user',
        });
      } else if (user.teamId) {
        // Update the user's team
        const updateData: Record<string, unknown> = {};
        
        if (plan !== undefined) updateData.plan = plan;
        if (seats !== undefined) updateData.seats = seats;
        if (status !== undefined) updateData.subscriptionStatus = status;
        if (expiresAt !== undefined) updateData.currentPeriodEnd = expiresAt ? new Date(expiresAt) : null;
        if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;

        const updatedTeam = await prisma.team.update({
          where: { id: user.teamId },
          data: updateData,
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'license.updated',
            entityType: 'team',
            entityId: user.teamId,
            metadata: JSON.stringify(updateData),
          },
        });

        return NextResponse.json({
          success: true,
          license: updatedTeam,
        });
      }

      return NextResponse.json({
        success: true,
        message: 'User remains on free plan',
      });
    }

    return NextResponse.json(
      { error: 'Invalid license type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to update license:', error);
    return NextResponse.json(
      { error: 'Failed to update license' },
      { status: 500 }
    );
  }
}

// DELETE - Revoke/downgrade license (remove from team or cancel subscription)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await verifyAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'team';

    if (type === 'team') {
      const team = await prisma.team.findUnique({
        where: { id },
        include: { members: true },
      });

      if (!team) {
        return NextResponse.json({ error: 'Team not found' }, { status: 404 });
      }

      // Remove all members from team
      await prisma.user.updateMany({
        where: { teamId: id },
        data: { teamId: null, role: 'member' },
      });

      // Delete the team
      await prisma.team.delete({
        where: { id },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'license.revoked',
          entityType: 'team',
          entityId: id,
          metadata: JSON.stringify({ memberCount: team.members.length }),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Team license revoked and team deleted',
      });
    }

    return NextResponse.json(
      { error: 'Invalid license type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Failed to revoke license:', error);
    return NextResponse.json(
      { error: 'Failed to revoke license' },
      { status: 500 }
    );
  }
}
