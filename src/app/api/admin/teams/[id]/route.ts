import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET - Get a single team with details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
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
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(team);
  } catch (error) {
    console.error('Failed to fetch team:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team' },
      { status: 500 }
    );
  }
}

// PATCH - Update a team
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, plan, seats, ssoEnabled, ssoDomain, ssoProvider } = body;

    const team = await prisma.team.findUnique({
      where: { id },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (plan !== undefined) updateData.plan = plan;
    if (seats !== undefined) updateData.seats = seats;
    if (ssoEnabled !== undefined) updateData.ssoEnabled = ssoEnabled;
    if (ssoDomain !== undefined) updateData.ssoDomain = ssoDomain;
    if (ssoProvider !== undefined) updateData.ssoProvider = ssoProvider;

    const updatedTeam = await prisma.team.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updatedTeam);
  } catch (error) {
    console.error('Failed to update team:', error);
    return NextResponse.json(
      { error: 'Failed to update team' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a team
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const team = await prisma.team.findUnique({
      where: { id },
      include: { _count: { select: { members: true } } },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found' },
        { status: 404 }
      );
    }

    // Remove team association from members first
    await prisma.user.updateMany({
      where: { teamId: id },
      data: { teamId: null },
    });

    // Delete team
    await prisma.team.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete team:', error);
    return NextResponse.json(
      { error: 'Failed to delete team' },
      { status: 500 }
    );
  }
}
