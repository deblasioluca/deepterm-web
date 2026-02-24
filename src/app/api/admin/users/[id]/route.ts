import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// GET - Get a single user
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        team: {
          select: { id: true, name: true, plan: true },
        },
        sessions: {
          select: { id: true, device: true, lastActive: true },
          orderBy: { lastActive: 'desc' },
          take: 5,
        },
        _count: {
          select: { ideas: true, votes: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      avatarUrl: user.avatarUrl,
      team: user.team,
      sessions: user.sessions,
      stats: {
        ideas: user._count.ideas,
        votes: user._count.votes,
      },
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

// PATCH - Update a user
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { name, email, password, role, teamId } = body;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Check email uniqueness if changing
    if (email && email !== user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });
      if (existingUser) {
        return NextResponse.json(
          { error: 'Email already in use' },
          { status: 400 }
        );
      }
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (teamId !== undefined) updateData.teamId = teamId || null;
    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        team: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      team: updatedUser.team,
      updatedAt: updatedUser.updatedAt,
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

// DELETE - Delete a user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete user and related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete votes first (references ideas)
      await tx.vote.deleteMany({
        where: { userId: id },
      });

      // Delete ideas
      await tx.idea.deleteMany({
        where: { authorId: id },
      });

      // Delete sessions
      await tx.session.deleteMany({
        where: { userId: id },
      });

      // Finally delete the user
      await tx.user.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
