import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  refreshTokenPair,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/token/refresh
 * Refresh access token using refresh token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refreshToken } = body;

    if (!refreshToken) {
      return errorResponse('Refresh token is required');
    }

    // Attempt to refresh tokens
    const tokens = await refreshTokenPair(refreshToken);

    if (!tokens) {
      return errorResponse('Invalid or expired refresh token', 401);
    }

    const response = successResponse({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Token refresh error:', error);
    return errorResponse('Token refresh failed', 500);
  }
}
