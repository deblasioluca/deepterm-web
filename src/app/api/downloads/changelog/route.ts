import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = (searchParams.get('platform') || '').trim().toLowerCase();
    const where = platform ? { platform } : undefined;

    const releases = await prisma.release.findMany({
      where,
      select: {
        platform: true,
        version: true,
        releaseNotes: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
    });

    return NextResponse.json({ releases });
  } catch (error) {
    console.error('Failed to list changelog:', error);
    return NextResponse.json({ error: 'Failed to list changelog' }, { status: 500 });
  }
}
