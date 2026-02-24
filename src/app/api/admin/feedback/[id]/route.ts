import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status } = body;

    const idea = await prisma.idea.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(idea);
  } catch (error) {
    console.error('Failed to update idea:', error);
    return NextResponse.json(
      { error: 'Failed to update idea' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await prisma.idea.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete idea:', error);
    return NextResponse.json(
      { error: 'Failed to delete idea' },
      { status: 500 }
    );
  }
}
