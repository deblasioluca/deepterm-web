import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const passkeys = await prisma.adminPasskey.findMany({
      where: { adminUserId: session.id },
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
    console.error('Failed to fetch admin passkeys:', error);
    return NextResponse.json({ error: 'Failed to fetch passkeys' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    let passkeyId = searchParams.get('id');

    if (!passkeyId) {
      try {
        const body = await request.json();
        passkeyId = body.passkeyId || body.id;
      } catch {
        // ignore
      }
    }

    if (!passkeyId) {
      return NextResponse.json({ error: 'Passkey ID is required' }, { status: 400 });
    }

    const passkey = await prisma.adminPasskey.findFirst({
      where: { id: passkeyId, adminUserId: session.id },
      select: { id: true },
    });

    if (!passkey) {
      return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });
    }

    await prisma.adminPasskey.delete({ where: { id: passkeyId } });

    return NextResponse.json({ success: true, message: 'Passkey deleted successfully' });
  } catch (error) {
    console.error('Failed to delete admin passkey:', error);
    return NextResponse.json({ error: 'Failed to delete passkey' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = getAdminSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    const name = typeof body?.name === 'string' ? body.name.trim() : '';

    if (!id || !name) {
      return NextResponse.json({ error: 'Passkey ID and name are required' }, { status: 400 });
    }

    const passkey = await prisma.adminPasskey.findFirst({
      where: { id, adminUserId: session.id },
      select: { id: true },
    });

    if (!passkey) {
      return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });
    }

    await prisma.adminPasskey.update({ where: { id }, data: { name } });

    return NextResponse.json({ success: true, message: 'Passkey renamed successfully' });
  } catch (error) {
    console.error('Failed to rename admin passkey:', error);
    return NextResponse.json({ error: 'Failed to rename passkey' }, { status: 500 });
  }
}
