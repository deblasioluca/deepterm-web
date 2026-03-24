import { test, expect } from '@playwright/test';

test.describe('Organization API Endpoints', () => {
  test('unauthenticated org list returns 401', async ({ request }) => {
    const response = await request.get('/api/zk/organizations');
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated org invite returns 401', async ({ request }) => {
    const response = await request.post('/api/zk/organizations/fake-org-id/members/invite', {
      data: { email: 'test@example.com', role: 'member' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated org accept returns 401', async ({ request }) => {
    const response = await request.post('/api/zk/organizations/fake-org-id/accept', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated org members list returns 401', async ({ request }) => {
    const response = await request.get('/api/zk/organizations/fake-org-id/members');
    expect([401, 403]).toContain(response.status());
  });

  test('unauthenticated org teams list returns 401', async ({ request }) => {
    const response = await request.get('/api/zk/organizations/fake-org-id/teams');
    expect([401, 403]).toContain(response.status());
  });

  test('invite endpoint rejects invalid payload', async ({ request }) => {
    // No email provided — should get 400 or 401
    const response = await request.post('/api/zk/organizations/fake-org-id/members/invite', {
      data: { role: 'member' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 401, 403]).toContain(response.status());
  });

  test('invite CORS preflight returns 200', async ({ request }) => {
    const response = await request.fetch('/api/zk/organizations/fake-org-id/members/invite', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://deepterm.net',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect([200, 204]).toContain(response.status());
  });

  test('accept CORS preflight returns 200', async ({ request }) => {
    const response = await request.fetch('/api/zk/organizations/fake-org-id/accept', {
      method: 'OPTIONS',
      headers: {
        'Origin': 'https://deepterm.net',
        'Access-Control-Request-Method': 'POST',
      },
    });
    expect([200, 204]).toContain(response.status());
  });

  test('pending invitations endpoint requires auth', async ({ request }) => {
    const response = await request.get('/api/zk/invitations/pending');
    expect([401, 403]).toContain(response.status());
  });

  test('audit log endpoint requires auth', async ({ request }) => {
    const response = await request.get('/api/zk/organizations/fake-org-id/audit-log');
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('Account API Endpoints', () => {
  test('account check endpoint exists', async ({ request }) => {
    const response = await request.post('/api/zk/accounts/check', {
      data: { email: 'nonexistent@test.com' },
      headers: { 'Content-Type': 'application/json' },
    });
    // Should return a valid response (200 with exists:false or 404)
    expect([200, 400, 404]).toContain(response.status());
  });

  test('login endpoint rejects invalid credentials', async ({ request }) => {
    const response = await request.post('/api/zk/accounts/login', {
      data: { email: 'invalid@test.com', password: 'wrong' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 401, 404]).toContain(response.status());
  });

  test('register endpoint rejects missing fields', async ({ request }) => {
    const response = await request.post('/api/zk/accounts/register', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 401, 422]).toContain(response.status());
  });

  test('license endpoint requires auth', async ({ request }) => {
    const response = await request.get('/api/zk/accounts/license');
    expect([401, 403]).toContain(response.status());
  });

  test('token refresh endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/zk/accounts/token/refresh', {
      data: {},
      headers: { 'Content-Type': 'application/json' },
    });
    expect([400, 401, 403]).toContain(response.status());
  });
});

test.describe('Vault API Endpoints', () => {
  test('vault list requires auth', async ({ request }) => {
    const response = await request.get('/api/zk/vaults');
    expect([401, 403]).toContain(response.status());
  });

  test('vault items list requires auth', async ({ request }) => {
    const response = await request.get('/api/zk/vault-items');
    expect([401, 403]).toContain(response.status());
  });

  test('vault items bulk endpoint requires auth', async ({ request }) => {
    const response = await request.post('/api/zk/vault-items/bulk', {
      data: { items: [] },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(response.status());
  });
});
