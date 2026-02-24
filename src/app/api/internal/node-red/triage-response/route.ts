/**
 * POST /api/internal/node-red/triage-response
 *
 * Called by Node-RED when the admin approves/rejects/defers an issue or idea
 * via WhatsApp. Updates the item status in the database.
 *
 * Headers: x-api-key (must match NODE_RED_API_KEY env var)
 * Body:    { action: "approve"|"reject"|"defer", itemId: string, itemType?: "issue"|"idea"|"auto", reason?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_RED_API_KEY = process.env.NODE_RED_API_KEY || 'change-me-to-a-secure-key';

// Map triage actions to database statuses
const ISSUE_STATUS_MAP: Record<string, string> = {
  approve: 'in_progress',
  reject: 'closed',
  defer: 'open', // stays open but noted as deferred
};

const IDEA_STATUS_MAP: Record<string, string> = {
  approve: 'planned',
  reject: 'declined',
  defer: 'consideration',
};

export async function POST(request: NextRequest) {
  // ── Auth ──
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== NODE_RED_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      action?: string;
      itemId?: string;
      itemType?: 'issue' | 'idea' | 'auto';
      reason?: string;
    };

    const { action, itemId, itemType = 'auto', reason } = body;

    if (!action || !['approve', 'reject', 'defer'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be: approve, reject, or defer' },
        { status: 400 }
      );
    }

    if (!itemId) {
      return NextResponse.json({ error: 'Missing itemId' }, { status: 400 });
    }

    // ── Auto-detect item type ──
    let resolvedType = itemType;
    if (resolvedType === 'auto') {
      const issue = await prisma.issue.findUnique({ where: { id: itemId }, select: { id: true } });
      if (issue) {
        resolvedType = 'issue';
      } else {
        const idea = await prisma.idea.findUnique({ where: { id: itemId }, select: { id: true } });
        if (idea) {
          resolvedType = 'idea';
        } else {
          return NextResponse.json({ error: `Item not found: ${itemId}` }, { status: 404 });
        }
      }
    }

    // ── Update item ──
    if (resolvedType === 'issue') {
      const newStatus = ISSUE_STATUS_MAP[action] || 'open';
      const issue = await prisma.issue.update({
        where: { id: itemId },
        data: { status: newStatus },
        select: { id: true, title: true, status: true },
      });

      // Add an update record for audit trail
      await prisma.issueUpdate.create({
        data: {
          issueId: itemId,
          authorType: 'admin',
          authorEmail: 'whatsapp-triage',
          message: `Triaged via WhatsApp: ${action}${reason ? ` – ${reason}` : ''}`,
          status: newStatus,
        },
      });

      return NextResponse.json({
        ok: true,
        type: 'issue',
        title: issue.title,
        newStatus: issue.status,
        action,
      });
    }

    if (resolvedType === 'idea') {
      const newStatus = IDEA_STATUS_MAP[action] || 'consideration';
      const idea = await prisma.idea.update({
        where: { id: itemId },
        data: { status: newStatus },
        select: { id: true, title: true, status: true },
      });

      return NextResponse.json({
        ok: true,
        type: 'idea',
        title: idea.title,
        newStatus: idea.status,
        action,
      });
    }

    return NextResponse.json({ error: 'Unknown item type' }, { status: 400 });
  } catch (error) {
    console.error('Triage response error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
