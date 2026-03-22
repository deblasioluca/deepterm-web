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
      const org = await prisma.organization.findUnique({
        where: { id },
        include: {
          members: {
            where: { status: 'active' },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }

      return NextResponse.json({
        license: {
          ...org,
          members: org.members.map((m) => ({
            id: m.id,
            name: m.user?.email || 'Unknown',
            email: m.user?.email || '',
            role: m.role,
            createdAt: m.createdAt,
          })),
        },
      });
    } else {
      const zkUser = await prisma.zKUser.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      // Check if user has an organization
      const membership = await prisma.organizationUser.findFirst({
        where: { userId: zkUser.id, status: 'active' },
        include: { organization: true },
      });

      return NextResponse.json({
        license: {
          ...zkUser,
          organization: membership?.organization || null,
        },
      });
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
      const org = await prisma.organization.findUnique({
        where: { id },
      });

      if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }

      const updateData: Record<string, unknown> = {};
      
      if (plan !== undefined) updateData.plan = plan;
      if (seats !== undefined) updateData.seats = seats;
      if (status !== undefined) updateData.subscriptionStatus = status;
      if (expiresAt !== undefined) updateData.currentPeriodEnd = expiresAt ? new Date(expiresAt) : null;
      if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;

      const updatedOrg = await prisma.organization.update({
        where: { id },
        data: updateData,
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'license.updated',
          entityType: 'organization',
          entityId: id,
          metadata: JSON.stringify(updateData),
        },
      });

      return NextResponse.json({
        success: true,
        license: updatedOrg,
      });
    } else if (type === 'user') {
      // For individual users, create an organization if upgrading from free
      const zkUser = await prisma.zKUser.findUnique({
        where: { id },
      });

      if (!zkUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      const existingMembership = await prisma.organizationUser.findFirst({
        where: { userId: zkUser.id, status: 'active' },
      });

      if (!existingMembership && plan && plan !== 'free' && plan !== 'starter') {
        // Create a new organization for this user
        const org = await prisma.organization.create({
          data: {
            name: `${zkUser.email}'s Organization`,
            plan,
            seats: seats || 1,
            subscriptionStatus: status || 'active',
            currentPeriodEnd: expiresAt ? new Date(expiresAt) : null,
            ssoEnabled: ssoEnabled || plan === 'team' || plan === 'enterprise',
          },
        });

        await prisma.organizationUser.create({
          data: {
            organizationId: org.id,
            userId: zkUser.id,
            role: 'owner',
            status: 'active',
          },
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'license.upgraded',
            entityType: 'user',
            entityId: id,
            metadata: JSON.stringify({ organizationId: org.id, plan }),
          },
        });

        return NextResponse.json({
          success: true,
          license: org,
          message: 'Created new organization for user',
        });
      } else if (existingMembership) {
        // Update the user's organization
        const updateData: Record<string, unknown> = {};
        
        if (plan !== undefined) updateData.plan = plan;
        if (seats !== undefined) updateData.seats = seats;
        if (status !== undefined) updateData.subscriptionStatus = status;
        if (expiresAt !== undefined) updateData.currentPeriodEnd = expiresAt ? new Date(expiresAt) : null;
        if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;

        const updatedOrg = await prisma.organization.update({
          where: { id: existingMembership.organizationId },
          data: updateData,
        });

        // Log audit
        await prisma.auditLog.create({
          data: {
            adminId: admin.id,
            action: 'license.updated',
            entityType: 'organization',
            entityId: existingMembership.organizationId,
            metadata: JSON.stringify(updateData),
          },
        });

        return NextResponse.json({
          success: true,
          license: updatedOrg,
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

// DELETE - Revoke/downgrade license (remove organization or cancel subscription)
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
      const org = await prisma.organization.findUnique({
        where: { id },
        include: { _count: { select: { members: true } } },
      });

      if (!org) {
        return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
      }

      // Remove all members from organization
      await prisma.organizationUser.deleteMany({
        where: { organizationId: id },
      });

      // Delete the organization
      await prisma.organization.delete({
        where: { id },
      });

      // Log audit
      await prisma.auditLog.create({
        data: {
          adminId: admin.id,
          action: 'license.revoked',
          entityType: 'organization',
          entityId: id,
          metadata: JSON.stringify({ memberCount: org._count.members }),
        },
      });

      return NextResponse.json({
        success: true,
        message: 'Organization license revoked and organization deleted',
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
