import { test, expect } from '@playwright/test';

// E2E Lifecycle Test — Full flow with loop-back
// Tests: create story → triage → plan → deliberation → implement →
//        test (fail) → loop-back to implement → test (pass) →
//        review → deploy → release → verify completed
//
// This test uses API calls only (no browser UI) to verify the
// lifecycle engine end-to-end.

const ADMIN_SESSION = Buffer.from(
  JSON.stringify({
    id: 'e2e-lifecycle-test',
    email: 'e2e@test.deepterm.net',
    role: 'admin',
    exp: Date.now() + 3600000,
  })
).toString('base64');

const ADMIN_HEADERS = {
  'Content-Type': 'application/json',
  Cookie: `admin-session=${ADMIN_SESSION}`,
};

let testStoryId: string;

// ── Helpers ──

async function lifecycleAction(
  request: any,
  action: string,
  storyId: string,
  extra: Record<string, unknown> = {}
) {
  const res = await request.post('/api/admin/cockpit/lifecycle', {
    data: { action, storyId, ...extra },
    headers: ADMIN_HEADERS,
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function emitEvent(
  request: any,
  storyId: string,
  stepId: string,
  event: string,
  detail?: Record<string, unknown>,
  actor = 'system'
) {
  const res = await request.post('/api/admin/cockpit/lifecycle/events', {
    data: {
      storyId,
      stepId,
      event,
      detail: detail ? JSON.stringify(detail) : undefined,
      actor,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  return { status: res.status(), body: await res.json().catch(() => null) };
}

async function getLifecycleState(request: any, storyId: string) {
  const res = await request.get(
    `/api/admin/cockpit/lifecycle?storyId=${storyId}`,
    { headers: ADMIN_HEADERS }
  );
  const data = await res.json();
  return data.stories?.find((s: any) => s.id === storyId) || null;
}

// ── Tests ──

test.describe('Lifecycle E2E — Full Flow with Loop-Back', () => {
  test.describe.configure({ mode: 'serial' });

  test('1. Create test story', async ({ request }) => {
    const res = await request.post('/api/admin/cockpit/planning/stories', {
      data: {
        title: '[E2E] Lifecycle full-flow test',
        description: 'Automated Playwright test — safe to delete',
        priority: 'low',
        status: 'backlog',
        scope: 'app',
        lifecycleTemplate: 'full',
      },
      headers: ADMIN_HEADERS,
    });
    expect(res.status()).toBe(201);
    const story = await res.json();
    expect(story.id).toBeTruthy();
    testStoryId = story.id;
  });

  test('2. Start lifecycle at triage', async ({ request }) => {
    const ev = await emitEvent(request, testStoryId, 'triage', 'started', {
      message: 'E2E test — triage started',
    });
    expect(ev.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    expect(state).toBeTruthy();
    expect(state.lifecycleStep).toBe('triage');
  });

  test('3. Complete triage → auto-advance to plan', async ({ request }) => {
    const ev = await emitEvent(request, testStoryId, 'triage', 'completed', {
      message: 'Auto-approved by E2E test',
    });
    expect(ev.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('plan');
  });

  test('4. Complete plan → auto-advance to deliberation', async ({ request }) => {
    const ev = await emitEvent(request, testStoryId, 'plan', 'completed', {
      message: 'E2E test — planning done',
    });
    expect(ev.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('deliberation');
  });

  test('5. Skip deliberation → advance to implement', async ({ request }) => {
    // Use the gate action to skip deliberation
    const res = await lifecycleAction(request, 'skip-deliberation', testStoryId);
    expect(res.status).toBe(200);

    // Then emit completed event for deliberation
    await emitEvent(request, testStoryId, 'deliberation', 'completed', {
      message: 'Deliberation skipped by E2E test',
    });

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('implement');
  });

  test('6. Complete implement → auto-advance to test', async ({ request }) => {
    await emitEvent(request, testStoryId, 'implement', 'progress', {
      message: 'Agent coding...', progress: 50, total: 100,
    });

    const ev = await emitEvent(request, testStoryId, 'implement', 'completed', {
      message: 'PR #999 created (E2E test)',
    });
    expect(ev.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('test');
  });

  test('7. Simulate test failure', async ({ request }) => {
    // Build passes
    await emitEvent(request, testStoryId, 'test', 'progress', {
      suite: 'build', status: 'completed', passed: 1, failed: 0, total: 1, duration: 7,
      message: 'Build succeeded',
    }, 'ci');

    // Unit tests fail
    await emitEvent(request, testStoryId, 'test', 'failed', {
      suite: 'unit',
      passed: 10,
      failed: 2,
      total: 12,
      duration: 45,
      message: '2 unit tests failed',
      failures: [
        { test: 'TestDarkMode', class: 'SettingsTests', message: 'Expected true, got false', file: 'SettingsTests.swift', line: 42 },
        { test: 'TestThemeInit', class: 'ThemeTests', message: 'nil is not expected', file: 'ThemeTests.swift', line: 18 },
      ],
    }, 'ci');

    const state = await getLifecycleState(request, testStoryId);
    // Story should still be at test step (failed, not advanced)
    expect(state.lifecycleStep).toBe('test');
  });

  test('8. Loop-back: test → implement (auto-fix)', async ({ request }) => {
    const res = await lifecycleAction(
      request,
      'loop-test-to-implement',
      testStoryId,
      { reason: '2 unit tests failed — E2E auto-fix test' }
    );
    expect(res.status).toBe(200);
    expect(res.body?.action).toBe('loop-test-to-implement');

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('implement');
    expect(state.loopCount).toBe(1);
    expect(state.lastLoopFrom).toBe('test');
    expect(state.lastLoopTo).toBe('implement');
  });

  test('9. Re-implement → auto-advance to test', async ({ request }) => {
    const ev = await emitEvent(request, testStoryId, 'implement', 'completed', {
      message: 'Agent fixed 2 failing tests (E2E)',
    });
    expect(ev.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('test');
  });

  test('10. Tests pass → auto-advance to review', async ({ request }) => {
    // Build
    await emitEvent(request, testStoryId, 'test', 'progress', {
      suite: 'build', status: 'completed', passed: 1, failed: 0, total: 1, duration: 7,
      message: 'Build succeeded',
    }, 'ci');

    // Unit tests pass
    await emitEvent(request, testStoryId, 'test', 'progress', {
      suite: 'unit', status: 'completed', passed: 12, failed: 0, total: 12, duration: 32,
      message: 'All unit tests passed',
    }, 'ci');

    // UI tests pass
    await emitEvent(request, testStoryId, 'test', 'progress', {
      suite: 'ui', status: 'completed', passed: 8, failed: 0, total: 8, duration: 90,
      message: 'All UI tests passed',
    }, 'ci');

    // Final completed
    await emitEvent(request, testStoryId, 'test', 'completed', {
      message: 'All tests passed: build ✓, 12 unit ✓, 8 UI ✓',
      duration: 129,
    }, 'ci');

    const state = await getLifecycleState(request, testStoryId);
    expect(state.lifecycleStep).toBe('review');
  });

  test('11. Mark tests passed (gate) → advance to deploy', async ({ request }) => {
    // The gate action for review step
    const res = await lifecycleAction(request, 'mark-tests-passed', testStoryId);
    expect(res.status).toBe(200);

    // Then mark deployed
    const res2 = await lifecycleAction(request, 'mark-deployed', testStoryId);
    expect(res2.status).toBe(200);
  });

  test('12. Mark released → story completed', async ({ request }) => {
    const res = await lifecycleAction(request, 'mark-released', testStoryId);
    expect(res.status).toBe(200);

    const state = await getLifecycleState(request, testStoryId);
    // Story should be completed/released
    expect(['done', 'released', 'completed']).toContain(state.status);
  });

  test('13. Verify lifecycle events trail', async ({ request }) => {
    const res = await request.get(
      `/api/admin/cockpit/lifecycle/events?storyId=${testStoryId}`,
      { headers: ADMIN_HEADERS }
    );
    expect(res.status()).toBe(200);
    const { events } = await res.json();
    expect(events.length).toBeGreaterThanOrEqual(10);

    // Verify key events exist
    const eventTypes = events.map((e: any) => `${e.stepId}.${e.event}`);
    expect(eventTypes).toContain('triage.started');
    expect(eventTypes).toContain('triage.completed');
    expect(eventTypes).toContain('test.failed');
    expect(eventTypes).toContain('implement.completed');
    expect(eventTypes).toContain('test.completed');

    // Verify loop-back event
    const loopEvent = events.find((e: any) => e.event === 'loop-back');
    expect(loopEvent).toBeTruthy();
    expect(loopEvent.stepId).toBe('test');
  });

  test('14. Cleanup — delete test story', async ({ request }) => {
    if (!testStoryId) return;

    // Delete lifecycle events first (FK constraint)
    // Events are cascade-deleted with story if schema has onDelete: Cascade
    const res = await request.delete(
      `/api/admin/cockpit/planning/stories/${testStoryId}`,
      { headers: ADMIN_HEADERS }
    );
    // Accept 200 or 204 or even 500 (FK constraints)
    expect([200, 204, 500]).toContain(res.status());
  });
});

test.describe('Lifecycle E2E — Circuit Breaker', () => {
  test.describe.configure({ mode: 'serial' });

  let cbStoryId: string;

  test('CB-1. Create story for circuit breaker test', async ({ request }) => {
    const res = await request.post('/api/admin/cockpit/planning/stories', {
      data: {
        title: '[E2E] Circuit breaker test',
        description: 'Automated — safe to delete',
        priority: 'low',
        status: 'backlog',
        scope: 'app',
        lifecycleTemplate: 'full',
      },
      headers: ADMIN_HEADERS,
    });
    expect(res.status()).toBe(201);
    cbStoryId = (await res.json()).id;

    // Fast-forward to test step
    await emitEvent(request, cbStoryId, 'triage', 'started');
    await emitEvent(request, cbStoryId, 'triage', 'completed');
    await emitEvent(request, cbStoryId, 'plan', 'completed');
    await emitEvent(request, cbStoryId, 'deliberation', 'completed');
    await emitEvent(request, cbStoryId, 'implement', 'completed');

    const state = await getLifecycleState(request, cbStoryId);
    expect(state.lifecycleStep).toBe('test');
  });

  test('CB-2. Loop 5 times, then verify circuit breaker blocks', async ({ request }) => {
    for (let i = 1; i <= 5; i++) {
      // Fail test
      await emitEvent(request, cbStoryId, 'test', 'failed', {
        message: `Failure ${i}`, suite: 'unit', passed: 0, failed: 1, total: 1,
      }, 'ci');

      // Loop back
      const res = await lifecycleAction(request, 'loop-test-to-implement', cbStoryId, {
        reason: `Loop ${i} — E2E circuit breaker test`,
      });
      expect(res.status).toBe(200);
      expect(res.body?.action).toBe('loop-test-to-implement');

      // Re-implement and advance back to test
      await emitEvent(request, cbStoryId, 'implement', 'completed', {
        message: `Fix attempt ${i}`,
      });

      const state = await getLifecycleState(request, cbStoryId);
      expect(state.lifecycleStep).toBe('test');
      expect(state.loopCount).toBe(i);
    }

    // Attempt loop #6 — should be blocked by circuit breaker
    await emitEvent(request, cbStoryId, 'test', 'failed', {
      message: 'Failure 6', suite: 'unit', passed: 0, failed: 1, total: 1,
    }, 'ci');

    const blocked = await lifecycleAction(request, 'loop-test-to-implement', cbStoryId, {
      reason: 'Loop 6 — should be blocked',
    });
    expect(blocked.status).toBe(400);
    expect(blocked.body?.error).toContain('Circuit breaker');
  });

  test('CB-3. Cleanup', async ({ request }) => {
    if (!cbStoryId) return;
    await request.delete(`/api/admin/cockpit/planning/stories/${cbStoryId}`, {
      headers: ADMIN_HEADERS,
    });
  });
});
