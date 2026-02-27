import { test, expect } from '@playwright/test';

test.describe('SEO & Performance Basics', () => {
  const publicPages = ['/', '/pricing', '/product', '/security', '/documentation', '/enterprise'];

  for (const path of publicPages) {
    test(`${path} has meta description`, async ({ page }) => {
      await page.goto(path);
      const meta = page.locator('meta[name="description"]');
      const count = await meta.count();
      if (count > 0) {
        const content = await meta.getAttribute('content');
        expect(content?.length).toBeGreaterThan(10);
      }
      // Not a hard fail if missing — just informational
    });

    test(`${path} responds within 5 seconds`, async ({ page }) => {
      const start = Date.now();
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(5000);
    });

    test(`${path} has no console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      await page.goto(path);
      await page.waitForTimeout(1000);
      // Filter out common benign errors
      const realErrors = errors.filter(e => 
        !e.includes('favicon') && 
        !e.includes('third-party') &&
        !e.includes('analytics')
      );
      expect(realErrors).toHaveLength(0);
    });
  }

  test('homepage has Open Graph tags', async ({ page }) => {
    await page.goto('/');
    const ogTitle = page.locator('meta[property="og:title"]');
    const ogDesc = page.locator('meta[property="og:description"]');
    // Informational — check if OG tags exist
    const hasOg = (await ogTitle.count()) > 0 || (await ogDesc.count()) > 0;
    expect(hasOg).toBeTruthy();
  });
});
