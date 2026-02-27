import { test, expect } from '@playwright/test';

test.describe('API Health & Endpoints', () => {
  test('health endpoint returns OK', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty('status');
  });

  test('version endpoint returns version', async ({ request }) => {
    const response = await request.get('/api/version');
    expect(response.status()).toBe(200);
  });

  test('app tiers endpoint responds', async ({ request }) => {
    const response = await request.get('/api/app/tiers');
    expect([200, 401]).toContain(response.status());
  });

  test('ideas endpoint returns list', async ({ request }) => {
    const response = await request.get('/api/ideas');
    expect(response.status()).toBe(200);
  });

  test('issues endpoint responds', async ({ request }) => {
    const response = await request.get('/api/issues');
    expect([200, 401]).toContain(response.status());
  });

  test('downloads releases endpoint responds', async ({ request }) => {
    const response = await request.get('/api/downloads/releases');
    expect([200, 401]).toContain(response.status());
  });

  test('billing offerings endpoint works', async ({ request }) => {
    const response = await request.get('/api/billing/offerings');
    expect(response.status()).toBe(200);
  });

  test('update check endpoint works', async ({ request }) => {
    const response = await request.get('/api/app/updates/check');
    expect([200, 400]).toContain(response.status());
  });

  test('unauthenticated admin API returns 401', async ({ request }) => {
    const response = await request.get('/api/admin/stats');
    expect([401, 403]).toContain(response.status());
  });

  test('GitHub webhook endpoint exists', async ({ request }) => {
    const response = await request.post('/api/github/webhook', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect(response.status()).not.toBe(404);
  });
});
