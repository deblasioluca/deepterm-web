import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// GET - List all passkeys for the current user
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const passkeys = await prisma.passkey.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ passkeys });
  } catch (error) {
    console.error('Failed to fetch passkeys:', error);
    return NextResponse.json(
      { error: 'Failed to fetch passkeys' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a passkey
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Accept ID from query params or request body
    const { searchParams } = new URL(request.url);
    let passkeyId = searchParams.get('id');
    
    // If not in query params, try request body
    if (!passkeyId) {
      try {
        const body = await request.json();
        passkeyId = body.passkeyId || body.id;
      } catch {
        // Body parsing failed, continue with null
      }
    }

    if (!passkeyId) {
      return NextResponse.json(
        { error: 'Passkey ID is required' },
        { status: 400 }
      );
    }

    // Verify the passkey belongs to the user
    const passkey = await prisma.passkey.findFirst({
      where: {
        id: passkeyId,
        userId: session.user.id,
      },
    });

    if (!passkey) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    await prisma.passkey.delete({
      where: { id: passkeyId },
    });

    return NextResponse.json({
      success: true,
      message: 'Passkey deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete passkey:', error);
    return NextResponse.json(
      { error: 'Failed to delete passkey' },
      { status: 500 }
    );
  }
}

// PATCH - Rename a passkey
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, name } = body as { id: string; name: string };

    if (!id || !name) {
      return NextResponse.json(
        { error: 'Passkey ID and name are required' },
        { status: 400 }
      );
    }

    // Verify the passkey belongs to the user
    const passkey = await prisma.passkey.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    });

    if (!passkey) {
      return NextResponse.json(
        { error: 'Passkey not found' },
        { status: 404 }
      );
    }

    await prisma.passkey.update({
      where: { id },
      data: { name },
    });

    return NextResponse.json({
      success: true,
      message: 'Passkey renamed successfully',
    });
  } catch (error) {
    console.error('Failed to rename passkey:', error);
    return NextResponse.json(
      { error: 'Failed to rename passkey' },
      { status: 500 }
    );
  }
}
