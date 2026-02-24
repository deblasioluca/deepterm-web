import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getAuthFromRequest } from '@/lib/zk';

// CORS headers for cross-origin requests from the app
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function addCorsHeaders(response: NextResponse) {
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function errorResponse(message: string, status: number = 400) {
  return addCorsHeaders(
    NextResponse.json({ success: false, error: message }, { status })
  );
}

function successResponse(data: object) {
  return addCorsHeaders(
    NextResponse.json({ success: true, ...data }, { status: 200 })
  );
}

// Handle CORS preflight
export async function OPTIONS() {
  return addCorsHeaders(new NextResponse(null, { status: 204 }));
}

/**
 * POST /api/zk/iap/verify
 * Verify an Apple In-App Purchase receipt and update user's subscription
 * 
 * Body:
 * - receiptData: Base64 encoded receipt from StoreKit
 * - transactionId: The original transaction ID
 * - productId: The product identifier (e.g., "com.deepterm.pro.monthly")
 */
export async function POST(request: NextRequest) {
  try {
    const auth = getAuthFromRequest(request);

    if (!auth) {
      return errorResponse('Unauthorized', 401);
    }

    const body = await request.json();
    const { receiptData, transactionId, productId } = body;

    if (!receiptData || !transactionId || !productId) {
      return errorResponse('Missing required fields: receiptData, transactionId, productId');
    }

    // Verify receipt with Apple
    const verificationResult = await verifyWithApple(receiptData);

    if (!verificationResult.valid) {
      return errorResponse(verificationResult.error || 'Receipt verification failed');
    }

    // Find the matching transaction in the receipt
    const transaction = verificationResult.latestReceiptInfo?.find(
      (t: AppleTransaction) => t.original_transaction_id === transactionId
    );

    if (!transaction) {
      return errorResponse('Transaction not found in receipt');
    }

    // Calculate expiration date from Apple's response
    const expiresDateMs = parseInt(transaction.expires_date_ms, 10);
    const purchaseDateMs = parseInt(transaction.purchase_date_ms, 10);
    const expiresDate = new Date(expiresDateMs);
    const purchaseDate = new Date(purchaseDateMs);

    // Check if subscription is still valid
    const now = new Date();
    const isValid = expiresDate > now;

    // Update ZK user with Apple IAP info
    await prisma.zKUser.update({
      where: { id: auth.userId },
      data: {
        appleOriginalTransactionId: transactionId,
        applePurchaseDate: purchaseDate,
        appleExpiresDate: expiresDate,
        appleProductId: productId,
      },
    });

    // Get plan from product ID
    const plan = getApplePlan(productId);

    return successResponse({
      verified: true,
      subscription: {
        valid: isValid,
        plan: plan,
        productId: productId,
        transactionId: transactionId,
        purchaseDate: purchaseDate.toISOString(),
        expiresDate: expiresDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('IAP verification error:', error);
    return errorResponse('Failed to verify purchase', 500);
  }
}

interface AppleTransaction {
  original_transaction_id: string;
  transaction_id: string;
  product_id: string;
  purchase_date_ms: string;
  expires_date_ms: string;
  is_trial_period: string;
  is_in_intro_offer_period: string;
}

interface AppleVerificationResult {
  valid: boolean;
  error?: string;
  latestReceiptInfo?: AppleTransaction[];
}

/**
 * Verify receipt with Apple's verification server
 * Uses sandbox in development, production in production
 */
async function verifyWithApple(receiptData: string): Promise<AppleVerificationResult> {
  const sharedSecret = process.env.APPLE_SHARED_SECRET;
  
  if (!sharedSecret) {
    console.error('APPLE_SHARED_SECRET not configured');
    return { valid: false, error: 'Apple IAP not configured' };
  }

  // Try production first, then sandbox if it's a sandbox receipt
  const urls = [
    'https://buy.itunes.apple.com/verifyReceipt',      // Production
    'https://sandbox.itunes.apple.com/verifyReceipt', // Sandbox
  ];

  const requestBody = {
    'receipt-data': receiptData,
    'password': sharedSecret,
    'exclude-old-transactions': true,
  };

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      // Status 0 = valid
      if (result.status === 0) {
        return {
          valid: true,
          latestReceiptInfo: result.latest_receipt_info || [],
        };
      }

      // Status 21007 = sandbox receipt sent to production, try sandbox
      if (result.status === 21007) {
        continue;
      }

      // Other status codes are errors
      const errorMessage = getAppleErrorMessage(result.status);
      console.error(`Apple verification failed with status ${result.status}: ${errorMessage}`);
      
      // Don't return error yet if we haven't tried sandbox
      if (url === urls[urls.length - 1]) {
        return { valid: false, error: errorMessage };
      }
    } catch (error) {
      console.error(`Error verifying with ${url}:`, error);
      if (url === urls[urls.length - 1]) {
        return { valid: false, error: 'Network error during verification' };
      }
    }
  }

  return { valid: false, error: 'Verification failed' };
}

function getAppleErrorMessage(status: number): string {
  const errors: Record<number, string> = {
    21000: 'The App Store could not read the JSON object you provided',
    21002: 'The data in the receipt-data property was malformed',
    21003: 'The receipt could not be authenticated',
    21004: 'The shared secret does not match',
    21005: 'The receipt server is not currently available',
    21006: 'This receipt is valid but the subscription has expired',
    21007: 'This receipt is from the test environment (sandbox)',
    21008: 'This receipt is from the production environment',
    21010: 'This receipt could not be authorized',
    21100: 'Internal data access error',
  };
  return errors[status] || `Unknown error (status ${status})`;
}

function getApplePlan(productId: string): string {
  const mapping: Record<string, string> = {
    'com.deepterm.pro.monthly': 'pro',
    'com.deepterm.pro.yearly': 'pro',
    'com.deepterm.team.monthly': 'team',
    'com.deepterm.team.yearly': 'team',
  };
  return mapping[productId] || 'pro';
}
