import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { title, content, type, isActive, startDate, endDate } = body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (type !== undefined) updateData.type = type;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (startDate !== undefined) updateData.startDate = startDate ? new Date(startDate) : null;
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;

    const announcement = await prisma.announcement.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Failed to update announcement:', error);
    return NextResponse.json(
      { error: 'Failed to update announcement' },
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

    await prisma.announcement.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete announcement:', error);
    return NextResponse.json(
      { error: 'Failed to delete announcement' },
      { status: 500 }
    );
  }
}
