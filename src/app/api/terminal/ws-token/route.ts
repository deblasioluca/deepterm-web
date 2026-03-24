import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateAccessToken } from '@/lib/zk/jwt';
import {
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/terminal/ws-token
 * Generate a short-lived JWT for WebSocket authentication from a web session.
 * This bridges NextAuth sessions to the ZK JWT system used by the WS server.
 */
export async function POST() {
  try {
    // Use NextAuth session for web UI authentication
    const session = await auth();
    if (!session?.user?.email) {
      return errorResponse('Unauthorized — please log in', 401);
    }

    // Look up the ZKUser by email
    const zkUser = await prisma.zKUser.findUnique({
      where: { email: session.user.email },
    });
    if (!zkUser) {
      return errorResponse('No vault account found for this email. Please set up your vault first.', 404);
    }

    // Get the user's confirmed org memberships
    const orgUsers = await prisma.organizationUser.findMany({
      where: { userId: zkUser.id, status: { in: ['confirmed', 'active'] } },
      select: { organizationId: true },
    });
    const orgIds = orgUsers.map(ou => ou.organizationId);

    // Generate a short-lived access token for WebSocket auth
    const token = generateAccessToken({
      userId: zkUser.id,
      email: zkUser.email,
      orgIds,
    });

    const response = successResponse({ token, userId: zkUser.id, orgIds });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('WS token generation error:', error);
    return errorResponse('Failed to generate WebSocket token', 500);
  }
}
