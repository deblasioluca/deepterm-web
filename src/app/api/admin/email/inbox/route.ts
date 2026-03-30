/**
 * GET /api/admin/email/inbox — list all ingested email messages with filters.
 * PATCH /api/admin/email/inbox — bulk update status (archive, mark read, etc.)
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const classification = url.searchParams.get('classification');
    const priority = url.searchParams.get('priority');
    const search = url.searchParams.get('search');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Build where clause — exclude soft-deleted messages by default
    const where: Record<string, unknown> = {};

    if (status && status !== 'all') {
      where.status = status;
    } else {
      // When showing "all", exclude deleted messages
      where.status = { not: 'deleted' };
    }
    if (classification && classification !== 'all') {
      where.classification = classification;
    }
    if (priority && priority !== 'all') {
      where.priority = priority;
    }
    if (search) {
      where.OR = [
        { subject: { contains: search } },
        { from: { contains: search } },
        { fromName: { contains: search } },
        { bodyText: { contains: search } },
      ];
    }

    const [messages, total] = await Promise.all([
      prisma.emailMessage.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          drafts: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      }),
      prisma.emailMessage.count({ where }),
    ]);

    // Get counts by status for sidebar badges
    const [unreadCount, readCount, repliedCount, archivedCount, spamCount, needsHumanCount] =
      await Promise.all([
        prisma.emailMessage.count({ where: { status: 'unread' } }),
        prisma.emailMessage.count({ where: { status: 'read' } }),
        prisma.emailMessage.count({ where: { status: 'replied' } }),
        prisma.emailMessage.count({ where: { status: 'archived' } }),
        prisma.emailMessage.count({ where: { status: 'spam' } }),
        prisma.emailMessage.count({ where: { status: 'needs_human' } }),
      ]);

    // Get counts by classification category for folder view
    const [supportCount, bugCount, featureCount, billingCount, partnershipCount, personalCount] =
      await Promise.all([
        prisma.emailMessage.count({ where: { classification: 'support_request', status: { notIn: ['deleted', 'spam'] } } }),
        prisma.emailMessage.count({ where: { classification: 'bug_report', status: { notIn: ['deleted', 'spam'] } } }),
        prisma.emailMessage.count({ where: { classification: 'feature_request', status: { notIn: ['deleted', 'spam'] } } }),
        prisma.emailMessage.count({ where: { classification: 'billing_inquiry', status: { notIn: ['deleted', 'spam'] } } }),
        prisma.emailMessage.count({ where: { classification: 'partnership', status: { notIn: ['deleted', 'spam'] } } }),
        prisma.emailMessage.count({ where: { classification: 'personal', status: { notIn: ['deleted', 'spam'] } } }),
      ]);

    return NextResponse.json({
      messages,
      total,
      counts: {
        unread: unreadCount,
        read: readCount,
        replied: repliedCount,
        archived: archivedCount,
        spam: spamCount,
        needs_human: needsHumanCount,
        total: unreadCount + readCount + repliedCount + archivedCount + spamCount + needsHumanCount,
      },
      categoryCounts: {
        support_request: supportCount,
        bug_report: bugCount,
        feature_request: featureCount,
        billing_inquiry: billingCount,
        partnership: partnershipCount,
        personal: personalCount,
      },
    });
  } catch (error) {
    console.error('Failed to list email messages:', error);
    return NextResponse.json(
      { error: 'Failed to list emails', message: String(error) },
      { status: 500 },
    );
  }
}

/** PATCH — bulk update message status */
export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as {
      ids?: string[];
      status?: string;
    };

    if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'ids array is required' },
        { status: 400 },
      );
    }

    const validStatuses = ['unread', 'read', 'replied', 'archived', 'spam', 'needs_human'];
    if (!body.status || !validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Bad Request', message: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 },
      );
    }

    const result = await prisma.emailMessage.updateMany({
      where: { id: { in: body.ids } },
      data: { status: body.status },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Failed to update email messages:', error);
    return NextResponse.json(
      { error: 'Failed to update', message: String(error) },
      { status: 500 },
    );
  }
}
