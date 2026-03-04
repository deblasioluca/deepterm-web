import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthFromRequest,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * GET /api/zk/accounts/public-key?email=user@example.com
 * Look up another user's RSA public key by email.
 * Required during the invite flow: the inviting user must encrypt the
 * organization's symmetric key with the invitee's public key before
 * sending the invite request.
 *
 * Auth: JWT required (must be a registered ZK user)
 * Returns: { publicKey: string } — only the RSA public key, never private material
 */
export async function GET(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return errorResponse('email query parameter is required');
    }

    const user = await prisma.zKUser.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { publicKey: true },
    });

    if (!user || !user.publicKey) {
      return errorResponse('User not found or has no public key', 404);
    }

    const response = successResponse({ publicKey: user.publicKey });
    return addCorsHeaders(response);
  } catch (error) {
    console.error('Public key lookup error:', error);
    return errorResponse('Failed to retrieve public key', 500);
  }
}
