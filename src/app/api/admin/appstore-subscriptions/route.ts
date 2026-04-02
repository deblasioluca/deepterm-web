import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAdminSession } from '@/lib/admin-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/appstore-subscriptions
 * Returns Apple App Store subscription data for the admin dashboard.
 * Queries both User and ZKUser tables for Apple subscription fields.
 */
export async function GET(request: NextRequest) {
  const session = getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized', message: 'Valid admin session required' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search') || '';
    const statusFilter = searchParams.get('status') || ''; // 'active' | 'expired' | ''

    const skip = (page - 1) * limit;
    const now = new Date();

    // Query users with App Store subscriptions (via User table)
    const userWhere: Record<string, unknown> = {
      appStoreOriginalTransactionId: { not: null },
    };
    if (search) {
      userWhere.email = { contains: search };
    }

    const users = await prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        email: true,
        name: true,
        plan: true,
        subscriptionSource: true,
        subscriptionExpiresAt: true,
        appStoreOriginalTransactionId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Query ZKUser table for Apple IAP details (product ID, purchase/expiry dates)
    const zkUsers = await prisma.zKUser.findMany({
      where: {
        appleOriginalTransactionId: { not: null },
      },
      select: {
        id: true,
        email: true,
        webUserId: true,
        appleOriginalTransactionId: true,
        applePurchaseDate: true,
        appleExpiresDate: true,
        appleProductId: true,
      },
    });

    // Build a lookup from webUserId -> ZKUser Apple data
    const zkByWebUserId = new Map(
      zkUsers.filter((z) => z.webUserId).map((z) => [z.webUserId, z])
    );
    // Also build by email for fallback
    const zkByEmail = new Map(
      zkUsers.map((z) => [z.email, z])
    );

    // Merge User + ZKUser data
    const merged = users.map((user) => {
      const zk = zkByWebUserId.get(user.id) || zkByEmail.get(user.email);
      const expiresAt = user.subscriptionExpiresAt || zk?.appleExpiresDate || null;
      const isActive = expiresAt ? new Date(expiresAt) > now : user.subscriptionSource === 'appstore';
      const productId = zk?.appleProductId || null;
      const purchaseDate = zk?.applePurchaseDate || null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        subscriptionSource: user.subscriptionSource,
        productId,
        originalTransactionId: user.appStoreOriginalTransactionId,
        purchaseDate: purchaseDate ? new Date(purchaseDate).toISOString() : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
        isActive,
        status: isActive ? 'active' : 'expired',
        createdAt: user.createdAt.toISOString(),
      };
    });

    // Apply status filter
    const filtered = statusFilter
      ? merged.filter((s) => s.status === statusFilter)
      : merged;

    // Calculate stats
    const allActive = merged.filter((s) => s.isActive);
    const allExpired = merged.filter((s) => !s.isActive);

    const planBreakdown: Record<string, number> = {};
    for (const sub of allActive) {
      const plan = sub.plan || 'unknown';
      planBreakdown[plan] = (planBreakdown[plan] || 0) + 1;
    }

    // Expiring soon (within 7 days)
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const expiringSoon = allActive.filter(
      (s) => s.expiresAt && new Date(s.expiresAt) <= sevenDaysFromNow
    );

    // Paginate the filtered results
    const paginated = filtered.slice(skip, skip + limit);
    const totalFiltered = filtered.length;

    return NextResponse.json({
      subscriptions: paginated,
      stats: {
        totalAppStore: merged.length,
        totalActive: allActive.length,
        totalExpired: allExpired.length,
        expiringSoon: expiringSoon.length,
        planBreakdown,
      },
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit),
      },
    });
  } catch (error) {
    console.error('Failed to fetch App Store subscriptions:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: 'Failed to fetch App Store subscriptions' },
      { status: 500 }
    );
  }
}
