import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  checkRateLimit,
  getRateLimitKey,
  getClientIP,
  rateLimitResponse,
  errorResponse,
  successResponse,
  handleCorsPreflightRequest,
  addCorsHeaders,
} from '@/lib/zk';

export async function OPTIONS() {
  return handleCorsPreflightRequest();
}

/**
 * POST /api/zk/accounts/password-hint
 * Get password hint for a user (rate limited)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email) {
      return errorResponse('Email is required');
    }

    const normalizedEmail = email.toLowerCase();
    const clientIP = getClientIP(request);
    const rateLimitKey = getRateLimitKey(`hint:${normalizedEmail}`, clientIP);

    // Rate limit password hint requests
    const rateLimitResult = await checkRateLimit(rateLimitKey);
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // Find user
    const user = await prisma.zKUser.findUnique({
      where: { email: normalizedEmail },
      select: { passwordHint: true },
    });

    // Always return success to prevent email enumeration
    // If user doesn't exist or has no hint, still return generic message
    const response = successResponse({
      message: user?.passwordHint
        ? 'Password hint sent'
        : 'If an account exists with this email, a password hint will be sent',
      hint: user?.passwordHint || null, // In production, this should be sent via email instead
    });

    return addCorsHeaders(response);
  } catch (error) {
    console.error('Password hint error:', error);
    return errorResponse('Failed to retrieve password hint', 500);
  }
}
