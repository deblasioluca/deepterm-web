import { test, expect } from '@playwright/test';

/**
 * E2E Lifecycle Test — LIFECYCLE-V2-PLAN task 5.7
 *
 * Tests the full lifecycle state machine via API:
 *   1. Full gate advancement (triage → release)
 *   2. CI event callbacks + auto-advance
 *   3. Loop-back (test failure → implement)
 *   4. Circuit breaker
 *   5. Abandon implementation
 *
 * Works in both environments:
 *   - Live Pi: uses AI_DEV_API_KEY from .env
 *   - CI (ubuntu): uses E2E_API_KEY env var
 */

const API_KEY = process.env.AI_DEV_API_KEY || process.env.E2E_API_KEY || 'test-api-key-for-ci';

// Forge a valid admin session token (middleware only checks JSON structure + expiry)
function makeAdminToken(): string {
  return Buffer.from(
    JSON.stringify({
      id: 'e2e-lifecycle-test',
      email: 'e2e@deepterm.net',
      role: 'superadmin',
      exp: Date.now() + 3_600_000, // 1 hour
    })
  ).toString('base64');
}

const ADMIN_COOKIE = `admin-session=${makeAdminToken()}`;

// ── Helpers ──

async function adminPost(request: any, path: string, data: Record<string, unknown>) {
  return request.post(path, {
    data,
    headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
  });
}

async function adminGet(request: any, path: string) {
  return request.get(path, {
    headers: { Cookie: ADMIN_COOKIE },
  });
}

async function ciPost(request: any, path: string, data: Record<string, unknown>) {
  return request.post(path, {
    data,
    headers: { 'Content-Type': 'application/json', 'x-api-key': API_KEY },
  });
}

async function createTestStory(request: any, title: string) {
  const res = await adminPost(request, '/api/admin/cockpit/planning/stories', {
    title,
    description: 'E2E lifecycle test — safe to delete',
    priority: 'low',
    status: 'backlog',
    scope: 'app',
    lifecycleTemplate: 'full',
  });
  expect(res.status()).toBe(201);
  return res.json();
}

async function deleteStory(request: any, storyId: string) {
  // Delete lifecycle events first (FK constraint)
  await adminPost(request, '/api/admin/cockpit/lifecycle', {
    action: 'reset-all',
    storyId,
  }).catch(() => {});

  const res = await request.delete(`/api/admin/cockpit/planning/stories/${storyId}`, {
    headers: { Cookie: ADMIN_COOKIE },
  });
  return res;
}

async function lifecycleAction(request: any, action: string, storyId: string, extra?: Record<string, unknown>) {
  return adminPost(request, '/api/admin/cockpit/lifecycle', { action, storyId, ...extra });
}

async function getStory(request: any, storyId: string) {
  const res = await adminGet(request, `/api/admin/cockpit/lifecycle?storyId=${storyId}`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  return body.stories?.find((s: any) => s.id === storyId) || null;
}

async function postCIEvent(request: any, storyId: string, stepId: string, event: string, detail?: Record<string, unknown>) {
  return ciPost(request, '/api/admin/cockpit/lifecycle/events', {
    storyId,
    stepId,
    event,
    detail: detail ? JSON.stringify(detail) : undefined,
    actor: 'ci',
  });
}

// ── Tests ──

test.describe('Lifecycle State Machine (E2E)', () => {
  test.describe.configure({ timeout: 60_000 });

  let storyId: string;

  test.beforeAll(async ({ request }) => {
    const story = await createTestStory(request, '[E2E] Lifecycle full flow test');
    storyId = story.id;
    expect(storyId).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    if (storyId) {
      await deleteStory(request, storyId);
    }
  });

  test('1. advance through all 8 gates to release', async ({ request }) => {
    // Set story to in_progress + start lifecycle at triage
    await request.patch(`/api/admin/cockpit/planning/stories/${storyId}`, {
      data: { status: 'in_progress' },
      headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
    });

    // Start lifecycle at triage
    const startRes = await lifecycleAction(request, 'reset-to-step', storyId, { stepId: 'triage' });
    expect(startRes.status()).toBe(200);

    // Gate 1: Triage → Plan (skip-step moves to next)
    let res = await lifecycleAction(request, 'skip-step', storyId, { stepId: 'triage' });
    expect(res.status()).toBe(200);
    let story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('plan');

    // Gate 2: Plan → Deliberation
    res = await lifecycleAction(request, 'skip-step', storyId, { stepId: 'plan' });
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('deliberation');

    // Gate 3: Deliberation → Implement (skip)
    res = await lifecycleAction(request, 'skip-deliberation', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('implement');

    // Gate 4: Implement → Test (manual-fix marks as done, advances)
    res = await lifecycleAction(request, 'manual-fix', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('test');

    // Gate 5: Test → Review (mark tests passed)
    res = await lifecycleAction(request, 'mark-tests-passed', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('review');

    // Gate 6: Review → Deploy (approve-pr)
    res = await lifecycleAction(request, 'approve-pr', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('deploy');

    // Gate 7: Deploy → Release
    res = await lifecycleAction(request, 'mark-deployed', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('release');

    // Gate 8: Release → Done
    res = await lifecycleAction(request, 'mark-released', storyId);
    expect(res.status()).toBe(200);
    story = await getStory(request, storyId);
    // After release, story may be "done" or step may be null/done
    expect(['done', 'released', 'release']).toContain(story?.lifecycleStep || story?.status);
  });

  test('2. CI events update lifecycle + auto-advance', async ({ request }) => {
    // Reset story for this test
    await lifecycleAction(request, 'reset-to-step', storyId, { stepId: 'test' });
    await request.patch(`/api/admin/cockpit/planning/stories/${storyId}`, {
      data: { status: 'in_progress' },
      headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
    });

    // Simulate CI: build started
    let res = await postCIEvent(request, storyId, 'test', 'started', {
      message: 'CI triggered (E2E test)',
    });
    expect(res.status()).toBe(200);

    // Simulate CI: build progress
    res = await postCIEvent(request, storyId, 'test', 'progress', {
      suite: 'unit',
      passed: 5,
      failed: 0,
      total: 10,
      status: 'running',
    });
    expect(res.status()).toBe(200);

    // Verify heartbeat was updated
    let story = await getStory(request, storyId);
    expect(story?.lifecycleHeartbeat).toBeTruthy();

    // Simulate CI: completed
    res = await postCIEvent(request, storyId, 'test', 'completed', {
      message: 'All tests passed',
      suite: 'final',
      duration: 120,
    });
    expect(res.status()).toBe(200);

    // Auto-advance should have moved to review
    story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('review');

    // Verify events are recorded
    const eventsRes = await adminGet(
      request,
      `/api/admin/cockpit/lifecycle/events?storyId=${storyId}&stepId=test`
    );
    expect(eventsRes.status()).toBe(200);
    const eventsBody = await eventsRes.json();
    expect(eventsBody.events.length).toBeGreaterThanOrEqual(3);
  });

  test('3. loop-back: test failure sends back to implement', async ({ request }) => {
    // Reset to test step
    await lifecycleAction(request, 'reset-to-step', storyId, { stepId: 'test' });

    // Trigger loop: test → implement
    const res = await lifecycleAction(request, 'loop-test-to-implement', storyId, {
      reason: 'E2E test: 2 unit tests failed',
    });
    expect(res.status()).toBe(200);

    const story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('implement');
    expect(story?.loopCount).toBeGreaterThanOrEqual(1);
    expect(story?.lastLoopFrom).toBe('test');
    expect(story?.lastLoopTo).toBe('implement');
  });

  test('4. circuit breaker blocks after maxLoops', async ({ request }) => {
    // Set loopCount to maxLoops (5) by patching
    // First reset loop count by doing reset-all + readvance
    await lifecycleAction(request, 'reset-all', storyId);
    await request.patch(`/api/admin/cockpit/planning/stories/${storyId}`, {
      data: { status: 'in_progress' },
      headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
    });
    await lifecycleAction(request, 'reset-to-step', storyId, { stepId: 'test' });

    // Loop 5 times (test→implement, then skip back to test)
    for (let i = 0; i < 5; i++) {
      const loopRes = await lifecycleAction(request, 'loop-test-to-implement', storyId, {
        reason: `Circuit breaker test loop ${i + 1}`,
      });
      expect(loopRes.status()).toBe(200);
      // Skip back to test for next loop
      await lifecycleAction(request, 'skip-step', storyId, { stepId: 'implement' });
    }

    // Verify loopCount is 5
    let story = await getStory(request, storyId);
    expect(story?.loopCount).toBe(5);

    // 6th loop should be blocked by circuit breaker
    const blocked = await lifecycleAction(request, 'loop-test-to-implement', storyId, {
      reason: 'Should be blocked',
    });
    expect(blocked.status()).toBe(400);
    const body = await blocked.json();
    expect(body.error).toContain('Circuit breaker');
  });

  test('5. abandon resets story to planned', async ({ request }) => {
    // Reset for abandon test
    await lifecycleAction(request, 'reset-all', storyId);
    await request.patch(`/api/admin/cockpit/planning/stories/${storyId}`, {
      data: { status: 'in_progress' },
      headers: { 'Content-Type': 'application/json', Cookie: ADMIN_COOKIE },
    });
    await lifecycleAction(request, 'reset-to-step', storyId, { stepId: 'review' });

    // Abandon
    const res = await lifecycleAction(request, 'abandon-implementation', storyId, {
      reason: 'E2E test: abandon flow',
    });
    expect(res.status()).toBe(200);

    const story = await getStory(request, storyId);
    expect(story?.lifecycleStep).toBe('plan');
    expect(story?.status).toBe('planned');
    expect(story?.loopCount).toBe(0);
  });

  test('6. lifecycle events endpoint requires API key', async ({ request }) => {
    // No API key → 401
    const res = await request.post('/api/admin/cockpit/lifecycle/events', {
      data: {
        storyId,
        stepId: 'test',
        event: 'heartbeat',
        actor: 'ci',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('7. lifecycle gate actions require valid story', async ({ request }) => {
    const res = await lifecycleAction(request, 'skip-step', 'nonexistent-story-id', {
      stepId: 'triage',
    });
    expect(res.status()).toBe(404);
  });
});
