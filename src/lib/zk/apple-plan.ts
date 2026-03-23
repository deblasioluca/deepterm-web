/**
 * apple-plan.ts
 * Shared helper to map Apple IAP product IDs to plan tier names.
 */

const APPLE_PRODUCT_PLAN_MAP: Record<string, string> = {
  'com.deepterm.pro.monthly': 'pro',
  'com.deepterm.pro.yearly': 'pro',
  'com.deepterm.team.monthly': 'team',
  'com.deepterm.team.yearly': 'team',
};

/**
 * Map an Apple product ID to the corresponding plan name.
 * Returns 'pro' as a safe default for unrecognised product IDs.
 */
export function getApplePlan(productId: string): string {
  return APPLE_PRODUCT_PLAN_MAP[productId] || 'pro';
}
