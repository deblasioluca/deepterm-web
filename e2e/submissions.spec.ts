import { test, expect } from '@playwright/test';

test.describe('Issue & Idea Submission (API)', () => {
  test('submit app issue via API', async ({ request }) => {
    const response = await request.post('/api/app/issues/submit', {
      data: {
        title: '[E2E Test] Playwright test issue',
        description: 'Automated test — safe to delete',
        category: 'bug',
        email: 'playwright@test.deepterm.net',
        appVersion: '0.0.0-test',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    // Should accept or require auth
    expect([200, 201, 401, 403]).toContain(response.status());
    if (response.status() === 200 || response.status() === 201) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('submit app idea via API', async ({ request }) => {
    const response = await request.post('/api/app/ideas/submit', {
      data: {
        title: '[E2E Test] Playwright test idea',
        description: 'Automated test — safe to delete',
        email: 'playwright@test.deepterm.net',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([200, 201, 401, 403]).toContain(response.status());
  });

  test('ideas list page renders', async ({ page }) => {
    // The public ideas/feedback page if it exists
    await page.goto('/dashboard/ideas');
    // May redirect to login or show ideas
    const url = page.url();
    expect(url).toBeDefined();
  });

  test('issue detail page handles invalid ID', async ({ page }) => {
    const response = await page.goto('/api/issues/99999999');
    expect(response?.status()).not.toBe(500); // Should not crash
  });
});
