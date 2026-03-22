import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get a single organization with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const team = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: {
          select: { members: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...team,
      members: team.members.map((m) => ({
        id: m.id,
        name: m.user?.email || 'Unknown',
        email: m.user?.email || '',
        role: m.role,
        createdAt: m.createdAt,
      })),
    });
  } catch (error) {
    console.error('Failed to fetch organization:', error);
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    );
  }
}

// PATCH - Update an organization
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, plan, seats, ssoEnabled, ssoDomain, ssoProvider } = body;

    const team = await prisma.organization.findUnique({
      where: { id },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (plan !== undefined) updateData.plan = plan;
    if (seats !== undefined) updateData.seats = seats;
    if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;
    if (ssoDomain !== undefined) updateData.ssoDomain = ssoDomain;
    if (ssoProvider !== undefined) updateData.ssoProvider = ssoProvider;

    const updatedTeam = await prisma.organization.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedTeam);
  } catch (error) {
    console.error('Failed to update organization:', error);
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    );
  }
}

// DELETE - Delete an organization
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const team = await prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      );
    }

    // Remove all members from organization first
    await prisma.organizationUser.deleteMany({
      where: { organizationId: id },
    });

    // Delete organization
    await prisma.organization.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete organization:', error);
    return NextResponse.json(
      { error: 'Failed to delete organization' },
      { status: 500 }
    );
  }
}
