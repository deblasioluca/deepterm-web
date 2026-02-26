/**
 * POST /api/webhooks/appstore
 *
 * Apple App Store Server Notifications v2 handler.
 * Receives signed JWS payloads from Apple when subscription state changes.
 *
 * Notification types handled:
 *   SUBSCRIBED, DID_RENEW, DID_FAIL_TO_RENEW, EXPIRED,
 *   GRACE_PERIOD_EXPIRED, REVOKE, REFUND
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NODE_RED_URL = process.env.NODE_RED_URL || 'http://192.168.1.30:1880';

// Notify Node-RED -> WhatsApp (fire-and-forget)
function notifyPayment(event: string, email: string, plan: string, details?: string) {
  fetch(`${NODE_RED_URL}/deepterm/payment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, email, plan, details, source: 'appstore' }),
  }).catch((err) => {
    console.error('Failed to notify Node-RED (App Store):', err);
  });
}

// Decode the signed payload from Apple (JWS)
function decodeJWSPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWS format');
  }
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signedPayload } = body;

    if (!signedPayload) {
      return NextResponse.json({ error: 'Missing signedPayload' }, { status: 400 });
    }

    // Decode the notification
    const notification = decodeJWSPayload(signedPayload);
    const notificationType = notification.notificationType as string;
    const subtype = notification.subtype as string | undefined;

    console.log(`App Store Notification: ${notificationType} (${subtype || 'no subtype'})`);

    // Decode transaction data
    const data = notification.data as Record<string, unknown> | undefined;
    if (!data?.signedTransactionInfo) {
      console.log('App Store: No transaction info in notification');
      return NextResponse.json({ ok: true });
    }

    const transactionInfo = decodeJWSPayload(data.signedTransactionInfo as string);
    const originalTransactionId = transactionInfo.originalTransactionId as string;
    const productId = transactionInfo.productId as string;
    const expiresDate = transactionInfo.expiresDate
      ? new Date(transactionInfo.expiresDate as number)
      : null;

    console.log(`App Store Transaction: ${originalTransactionId}, product: ${productId}, expires: ${expiresDate}`);

    // Find user by original transaction ID
    let user = await prisma.user.findFirst({
      where: { appStoreOriginalTransactionId: originalTransactionId },
    });

    // If not found by transaction ID, try appAccountToken (set during purchase)
    if (!user && transactionInfo.appAccountToken) {
      user = await prisma.user.findFirst({
        where: { id: transactionInfo.appAccountToken as string },
      });

      // Link the transaction ID for future lookups
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { appStoreOriginalTransactionId: originalTransactionId },
        });
      }
    }

    if (!user) {
      console.log(`App Store: No user found for transaction ${originalTransactionId}`);
      // Return 200 — Apple will retry on non-200
      return NextResponse.json({ ok: true });
    }

    // Log payment event
    const logEvent = async (event: string, plan: string, details?: string) => {
      await prisma.paymentEvent.create({
        data: { email: user!.email, event, plan, details },
      }).catch(() => { /* non-blocking */ });
    };

    // Handle notification types
    switch (notificationType) {
      case 'SUBSCRIBED': {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: 'pro',
            subscriptionSource: 'appstore',
            subscriptionExpiresAt: expiresDate,
            appStoreOriginalTransactionId: originalTransactionId,
          },
        });

        console.log(`App Store: ${user.email} subscribed to Pro`);
        await logEvent('appstore-subscribed', 'pro', `App Store subscription (${productId})`);
        notifyPayment('appstore-subscribed', user.email, 'pro', `App Store subscription (${productId})`);
        break;
      }

      case 'DID_RENEW': {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            plan: 'pro',
            subscriptionExpiresAt: expiresDate,
          },
        });

        console.log(`App Store: ${user.email} renewed Pro (expires: ${expiresDate})`);
        await logEvent('appstore-renewed', 'pro', `Renewed until ${expiresDate?.toISOString()}`);
        notifyPayment('appstore-renewed', user.email, 'pro', `Renewed until ${expiresDate?.toISOString()}`);
        break;
      }

      case 'DID_FAIL_TO_RENEW': {
        console.log(`App Store: ${user.email} renewal failed (billing issue)`);
        await logEvent('appstore-renewal-failed', 'pro', 'Billing issue — in grace period');
        notifyPayment('appstore-renewal-failed', user.email, 'pro', 'Billing issue — in grace period');
        break;
      }

      case 'EXPIRED': {
        // Only downgrade if they don't have active Stripe
        if (!user.stripeSubscriptionId) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'free',
              subscriptionSource: 'none',
              subscriptionExpiresAt: null,
            },
          });

          console.log(`App Store: ${user.email} subscription expired -> Free`);
          await logEvent('appstore-expired', 'free', 'Subscription expired');
          notifyPayment('appstore-expired', user.email, 'free', 'Subscription expired');
        } else {
          console.log(`App Store: ${user.email} App Store expired, but has Stripe — keeping Pro`);
        }
        break;
      }

      case 'GRACE_PERIOD_EXPIRED': {
        if (!user.stripeSubscriptionId) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'free',
              subscriptionSource: 'none',
              subscriptionExpiresAt: null,
            },
          });

          console.log(`App Store: ${user.email} grace period expired -> Free`);
          await logEvent('appstore-grace-expired', 'free', 'Grace period ended — downgraded');
          notifyPayment('appstore-grace-expired', user.email, 'free', 'Grace period ended — downgraded');
        }
        break;
      }

      case 'REVOKE': {
        if (!user.stripeSubscriptionId) {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: 'free',
              subscriptionSource: 'none',
              subscriptionExpiresAt: null,
              appStoreOriginalTransactionId: null,
            },
          });

          console.log(`App Store: ${user.email} subscription revoked -> Free`);
          await logEvent('appstore-revoked', 'free', 'Subscription revoked by Apple');
          notifyPayment('appstore-revoked', user.email, 'free', 'Subscription revoked by Apple');
        }
        break;
      }

      case 'REFUND': {
        console.log(`App Store: Refund for ${user.email}`);
        await logEvent('appstore-refund', user.plan, 'Refund processed');
        notifyPayment('appstore-refund', user.email, user.plan, 'Refund processed');
        break;
      }

      default:
        console.log(`App Store: Unhandled notification type: ${notificationType}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('App Store webhook error:', error);
    // Return 200 even on error to prevent Apple retries flooding
    return NextResponse.json({ ok: true });
  }
}
