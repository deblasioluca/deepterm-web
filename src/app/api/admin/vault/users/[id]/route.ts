import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();

    const allowedFields = ['rateLimitExempt'] as const;
    const data: Record<string, boolean> = {};

    for (const field of allowedFields) {
      if (field in body && typeof body[field] === 'boolean') {
        data[field] = body[field];
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'No valid fields to update' },
        { status: 400 }
      );
    }

    const user = await prisma.zKUser.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        rateLimitExempt: true,
      },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error('Admin vault user update error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to update vault user' },
      { status: 500 }
    );
  }
}
