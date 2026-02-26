import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { action } = await request.json();

    if (action === 'clear-sessions') {
      const deleted = await prisma.session.deleteMany();
      return NextResponse.json({ message: `Cleared ${deleted.count} session(s)` });
    }

    if (action === 'purge-deleted') {
      // Purge soft-deleted vault items older than 30 days
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deleted = await prisma.zKVaultItem.deleteMany({
        where: { deletedAt: { not: null, lt: cutoff } },
      });
      return NextResponse.json({ message: `Purged ${deleted.count} soft-deleted item(s)` });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error('Danger zone action error:', error);
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}
