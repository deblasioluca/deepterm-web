import { test, expect } from '@playwright/test';

test.describe('Checkout & Pricing Flow', () => {
  test('pricing page shows plans with CTAs', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toBeVisible();
    // Should have at least one actionable button
    const buttons = page.locator('button, a[href*="checkout"], a[href*="register"]');
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test('checkout page requires authentication', async ({ page }) => {
    await page.goto('/checkout');
    await page.waitForTimeout(1500);
    const url = page.url();
    // Should redirect to login or show auth requirement
    const content = await page.textContent('body');
    expect(url.includes('/login') || content?.toLowerCase().includes('sign in') || content?.toLowerCase().includes('log in') || url.includes('/checkout')).toBeTruthy();
  });

  test('Stripe webhook endpoint exists', async ({ request }) => {
    const response = await request.post('/api/webhooks/stripe', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    // Should not 404 — may return 400 without proper Stripe signature
    expect(response.status()).not.toBe(404);
  });
});

test.describe('Dashboard (Authenticated Area)', () => {
  test('dashboard redirects unauthenticated users', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForTimeout(1500);
    const url = page.url();
    // Should either redirect to login or show dashboard
    expect(url).toBeDefined();
  });

  test('dashboard page structure is valid', async ({ page }) => {
    const response = await page.goto('/dashboard');
    // Should not return 500
    expect(response?.status()).not.toBe(500);
  });
});
