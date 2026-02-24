import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const offerings = await prisma.subscriptionOffering.findMany({
      where: { stage: 'live', isActive: true },
      select: {
        key: true,
        interval: true,
        name: true,
        description: true,
        priceCents: true,
        currency: true,
      },
      orderBy: [{ key: 'asc' }, { interval: 'asc' }],
    });

    return NextResponse.json({ offerings });
  } catch (error) {
    console.error('Failed to fetch live offerings:', error);
    return NextResponse.json({ error: 'Failed to fetch offerings' }, { status: 500 });
  }
}
