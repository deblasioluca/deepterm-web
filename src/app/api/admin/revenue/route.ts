import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [totalUsers, proUsers, recentPayments] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { plan: 'pro' } }),
      prisma.paymentEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const freeUsers = totalUsers - proUsers;

    return NextResponse.json({
      summary: {
        totalUsers,
        proUsers,
        freeUsers,
        conversionRate: totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : '0',
      },
      recentPayments,
    });
  } catch (error) {
    console.error('Revenue dashboard error:', error);
    return NextResponse.json({ error: 'Failed to fetch revenue data' }, { status: 500 });
  }
}
