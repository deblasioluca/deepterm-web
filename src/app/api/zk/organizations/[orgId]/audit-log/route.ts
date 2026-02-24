import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  getOrganizationAuditLogs,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
  AuditEventType,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/organizations/[orgId]/audit-log
 * Get organization audit logs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { orgId } = await params;
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100);
    const eventType = searchParams.get('eventType');
    const userId = searchParams.get('userId');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    // Verify admin+ membership
    const orgUser = await prisma.organizationUser.findFirst({
      where: {
        userId: auth.userId,
        organizationId: orgId,
        status: 'confirmed',
        role: { in: ['owner', 'admin'] },
      },
    });

    if (!orgUser) {
      return errorResponse('Organization not found or insufficient permissions', 404);
    }

    // Get audit logs
    const result = await getOrganizationAuditLogs(orgId, {
      limit,
      offset: (page - 1) * limit,
      eventTypes: eventType ? [eventType as AuditEventType] : undefined,
      userId: userId || undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    const response = successResponse({
      data: result.data.map(log => ({
        id: log.id,
        userId: log.userId,
        userEmail: log.user?.email || null,
        eventType: log.eventType,
        targetType: log.targetType,
        targetId: log.targetId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        deviceInfo: log.deviceInfo,
        metadata: log.metadata,
        timestamp: log.timestamp.toISOString(),
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: Math.ceil(result.total / result.limit),
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Get audit log error:', error);
    return errorResponse('Failed to get audit log', 500);
  }
}
