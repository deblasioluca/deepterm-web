import { test, expect } from '@playwright/test';

test.describe('Public Pages', () => {
  test('homepage loads and has title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/DeepTerm/i);
    await expect(page.locator('body')).toBeVisible();
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page).toHaveTitle(/Pricing|DeepTerm/i);
    await expect(page.locator('body')).toBeVisible();
    // Should show at least one plan
    const content = await page.textContent('body');
    expect(content).toMatch(/free|pro|team|enterprise/i);
  });

  test('product page loads', async ({ page }) => {
    await page.goto('/product');
    await expect(page.locator('body')).toBeVisible();
  });

  test('security page loads', async ({ page }) => {
    await page.goto('/security');
    await expect(page.locator('body')).toBeVisible();
  });

  test('documentation page loads', async ({ page }) => {
    await page.goto('/documentation');
    await expect(page.locator('body')).toBeVisible();
  });

  test('enterprise page loads', async ({ page }) => {
    await page.goto('/enterprise');
    await expect(page.locator('body')).toBeVisible();
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/');
    // Check common nav elements exist
    const nav = page.locator('nav, header');
    await expect(nav.first()).toBeVisible();
  });

  test('404 page handles gracefully', async ({ page }) => {
    const response = await page.goto('/nonexistent-page-xyz');
    // Should return 404 or show a custom 404 page
    expect(response?.status()).toBe(404);
  });
});
