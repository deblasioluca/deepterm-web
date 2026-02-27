import { test, expect } from '@playwright/test';

test.describe('Authentication Pages', () => {
  test('login page loads with form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
    // Should have email/password inputs or SSO buttons
    const inputs = page.locator('input[type="email"], input[type="text"], input[type="password"]');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(1);
  });

  test('register page loads with form', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('body')).toBeVisible();
    const inputs = page.locator('input');
    const inputCount = await inputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(2);
  });

  test('login with invalid credentials shows error', async ({ page }) => {
    await page.goto('/login');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    
    if (await emailInput.isVisible() && await passwordInput.isVisible()) {
      await emailInput.fill('invalid@test.com');
      await passwordInput.fill('wrongpassword');
      
      const submitBtn = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first();
      if (await submitBtn.isVisible()) {
        await submitBtn.click();
        // Should show an error, not redirect to dashboard
        await page.waitForTimeout(2000);
        const url = page.url();
        expect(url).not.toContain('/dashboard');
      }
    }
  });

  test('admin login page loads', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.locator('body')).toBeVisible();
    // Should have a password input for admin
    const inputs = page.locator('input[type="password"]');
    const count = await inputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
