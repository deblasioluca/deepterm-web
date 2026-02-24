import { NextRequest, NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/admin-session';
import { notifyNodeRed } from '@/lib/node-red';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SAMPLE_PAYLOADS = {
  triage: {
    event: 'new-issue' as const,
    id: 'test-001',
    title: '[TEST] Sample bug report',
    description: 'This is a test notification from the admin panel.',
    category: 'General',
    source: 'admin-test',
    authorEmail: 'admin@deepterm.net',
    url: 'https://deepterm.net/admin/issues/test-001',
  },
  'build-status': {
    event: 'build-success' as const,
    repo: 'deepterm/app',
    branch: 'main',
    workflow: 'Release Build',
    commitMessage: '[TEST] Sample build notification',
    duration: '3m 42s',
    url: 'https://deepterm.net',
  },
  release: {
    event: 'new-release' as const,
    version: '0.0.0-test',
    platform: 'macOS',
    releaseNotes: 'This is a test release notification from the admin panel.',
    downloadUrl: 'https://deepterm.net/downloads',
  },
  payment: {
    event: 'payment-success' as const,
    email: 'testuser@example.com',
    plan: 'Pro (Annual)',
    amount: 9900,
    details: 'Test payment notification from admin panel',
  },
  'idea-popular': {
    event: 'idea-popular' as const,
    id: 'test-idea-001',
    title: '[TEST] Sample popular idea',
    voteCount: 50,
    threshold: 25,
    url: 'https://deepterm.net/admin/feedback',
  },
  security: {
    event: 'security-alert' as const,
    severity: 'low' as const,
    eventType: 'admin-test',
    sourceIp: '127.0.0.1',
    details: 'Test security alert from admin panel. No action required.',
  },
};

type TestableType = keyof typeof SAMPLE_PAYLOADS;

const VALID_TYPES: TestableType[] = [
  'triage',
  'build-status',
  'release',
  'payment',
  'idea-popular',
  'security',
];

export async function POST(request: NextRequest) {
  try {
    const adminSession = getAdminSession();
    if (!adminSession) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const type = typeof body?.type === 'string' ? body.type : '';

    if (!VALID_TYPES.includes(type as TestableType)) {
      return NextResponse.json(
        { error: 'Invalid notification type', message: `Must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const webhookType = type as TestableType;
    const payload = SAMPLE_PAYLOADS[webhookType];

    // Use wait: true so we can report success/failure to the admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await notifyNodeRed(webhookType, payload as any, { wait: true, timeoutMs: 10000 });

    if (!result.ok) {
      return NextResponse.json(
        { error: 'Notification failed', message: result.error || `Node-RED returned status ${result.status}` },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Test "${webhookType}" notification sent successfully`,
    });
  } catch (error) {
    console.error('Failed to send test WhatsApp notification:', error);
    return NextResponse.json(
      { error: 'Failed to send test notification' },
      { status: 500 }
    );
  }
}
