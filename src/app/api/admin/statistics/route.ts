/**
 * GET /api/admin/statistics
 *
 * Returns page view statistics for the admin dashboard.
 * Supports period filtering (7d, 30d, 90d) and excludes bots by default.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const includeBots = searchParams.get('bots') === 'true';
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const botFilter = includeBots ? {} : { isBot: false };

    // Run all queries in parallel
    const [
      totalViews,
      uniqueVisitors,
      topPages,
      topReferrers,
      topCountries,
      viewsByDay,
      topCities,
      geoPoints,
      botCount,
      recentViews,
    ] = await Promise.all([
      // Total page views
      prisma.pageView.count({
        where: { createdAt: { gte: startDate }, ...botFilter },
      }),

      // Unique visitors (distinct session IDs)
      prisma.pageView.groupBy({
        by: ['sessionId'],
        where: { createdAt: { gte: startDate }, ...botFilter, sessionId: { not: null } },
      }).then((r) => r.length),

      // Top pages
      prisma.pageView.groupBy({
        by: ['path'],
        where: { createdAt: { gte: startDate }, ...botFilter },
        _count: true,
        orderBy: { _count: { path: 'desc' } },
        take: 20,
      }),

      // Top referrers
      prisma.pageView.groupBy({
        by: ['referrer'],
        where: {
          createdAt: { gte: startDate },
          ...botFilter,
          referrer: { not: null },
        },
        _count: true,
        orderBy: { _count: { referrer: 'desc' } },
        take: 10,
      }),

      // Top countries
      prisma.pageView.groupBy({
        by: ['countryCode'],
        where: {
          createdAt: { gte: startDate },
          ...botFilter,
          countryCode: { not: null },
        },
        _count: true,
        orderBy: { _count: { countryCode: 'desc' } },
        take: 20,
      }),

      // Views by day (for time-series chart)
      prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
        `SELECT date(createdAt) as day, COUNT(*) as count
         FROM PageView
         WHERE createdAt >= ? ${includeBots ? '' : 'AND isBot = 0'}
         GROUP BY date(createdAt)
         ORDER BY day ASC`,
        startDate.toISOString(),
      ),

      // Top cities with geo data
      prisma.pageView.groupBy({
        by: ['city', 'countryCode'],
        where: {
          createdAt: { gte: startDate },
          ...botFilter,
          city: { not: null },
        },
        _count: true,
        orderBy: { _count: { city: 'desc' } },
        take: 15,
      }),

      // Geo points for world map (distinct lat/lon with counts)
      prisma.$queryRawUnsafe<Array<{
        latitude: number;
        longitude: number;
        countryCode: string;
        city: string;
        count: bigint;
      }>>(
        `SELECT ROUND(latitude, 1) as latitude, ROUND(longitude, 1) as longitude, countryCode, city, COUNT(*) as count
         FROM PageView
         WHERE createdAt >= ?
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
           ${includeBots ? '' : 'AND isBot = 0'}
         GROUP BY ROUND(latitude, 1), ROUND(longitude, 1), countryCode, city
         ORDER BY count DESC
         LIMIT 200`,
        startDate.toISOString(),
      ),

      // Bot count (for info)
      prisma.pageView.count({
        where: { createdAt: { gte: startDate }, isBot: true },
      }),

      // Recent page views (last 50)
      prisma.pageView.findMany({
        where: { createdAt: { gte: startDate }, ...botFilter },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          path: true,
          countryCode: true,
          city: true,
          referrer: true,
          isBot: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      overview: {
        totalViews,
        uniqueVisitors,
        botCount,
        period,
        days,
      },
      topPages: topPages.map((p) => ({ path: p.path, count: p._count })),
      topReferrers: topReferrers
        .filter((r) => r.referrer)
        .map((r) => ({ referrer: r.referrer!, count: r._count })),
      topCountries: topCountries
        .filter((c) => c.countryCode)
        .map((c) => ({ countryCode: c.countryCode!, count: c._count })),
      viewsByDay: viewsByDay.map((d) => ({
        date: d.day,
        count: Number(d.count),
      })),
      topCities: topCities
        .filter((c) => c.city)
        .map((c) => ({
          city: c.city!,
          countryCode: c.countryCode ?? '',
          count: c._count,
        })),
      geoPoints: geoPoints.map((g) => ({
        lat: g.latitude,
        lon: g.longitude,
        countryCode: g.countryCode,
        city: g.city,
        count: Number(g.count),
      })),
      recentViews,
    });
  } catch (error) {
    console.error('Failed to fetch statistics:', error);
    return NextResponse.json({ error: 'Failed to fetch statistics' }, { status: 500 });
  }
}
