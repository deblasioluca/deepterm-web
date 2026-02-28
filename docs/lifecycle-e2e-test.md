# Lifecycle V2 — End-to-End Test Procedure

**Purpose:** Verify the full lifecycle flow including feedback loops.

---

## Prerequisites

- Test epic exists: `cmm4w6qmi0000vzo954ybzrd4` ("Test Lifecycle Demo")
- Test stories available (dark mode, SSH reconnect, clipboard sync)
- Pi running: `http://10.10.10.10:3000/admin/devops` → Lifecycle tab
- GitHub token configured for PR operations

---

## Test 1: Happy Path (Full Lifecycle)

1. **Triage:** Navigate to DevOps → Triage. Approve a test story.
2. **Plan:** Verify story appears in Planning tab. Assign to epic, set scope ("app"), select template ("Full").
3. **Deliberation:** Start deliberation → verify 4 agents propose, debate, vote.
4. **Implement:** Agent loop creates PR → verify PR link appears in step card.
5. **Test:** CI triggers → verify per-suite progress pills (Build ✓, Unit ✓, UI ✓).
6. **Review:** Approve & merge → verify PR merged on GitHub.
7. **Deploy:** Build + sign + notarize (or skip for test).
8. **Release:** Release notes generated.
9. **Verify:** Progress bar shows 8/8 ✓, story status = "released".

## Test 2: Test Failure → Auto-Fix Loop

1. Complete steps 1–4 (through Implement).
2. **Test fails:** Verify failed test details appear (test names, file, line).
3. Click **"Auto-fix (AI)"** → verify loop-back event created.
4. **Verify:** Story resets to Implement, loop counter shows "(1/3)".
5. **Verify:** SVG loop arrow appears between Test → Implement.
6. **Verify:** Right panel shows loop history entry.
7. **Verify:** GitHub PR has loop-back comment.
8. **Verify:** WhatsApp notification sent (if Node-RED connected).

## Test 3: Review → Implement Loop

1. Complete steps 1–6 (through Test passing).
2. In Review, click **"Request Changes → Implement"**.
3. Enter feedback text (required field).
4. **Verify:** Story resets to Implement with feedback context.
5. **Verify:** Loop history shows review rejection entry.

## Test 4: Review → Deliberation Loop

1. Complete steps 1–6.
2. In Review, click **"Back to Deliberation"**.
3. **Verify:** PR closed on GitHub (not merged).
4. **Verify:** Story resets to Deliberation step.

## Test 5: Abandon Implementation

1. Complete steps 1–6.
2. In Review, click **"Abandon"** → confirm dialog.
3. **Verify:** PR closed on GitHub.
4. **Verify:** Feature branch deleted on GitHub.
5. **Verify:** Story resets to Planning (status: planned).

## Test 6: Circuit Breaker

1. Trigger 5 loop-backs (test fail → auto-fix) on same story.
2. **Verify:** After loop 5, auto-fix button is disabled.
3. **Verify:** Story flagged for human intervention.

## Test 7: Heartbeat Staleness

1. Start a step that normally sends heartbeats.
2. Wait 90+ seconds without heartbeat.
3. **Verify:** Warning banner appears: "No heartbeat for 90s — step may be stuck."

## Test 8: Template Selection

1. In Planning, set story template to "Quick Fix".
2. Start lifecycle → **verify** Deliberation step is skipped.
3. In Planning, set story template to "Hotfix".
4. Start lifecycle → **verify** only Implement → Test → Deploy shown.

---

## Automated E2E (Future)

When Playwright tests cover the cockpit:
- `e2e/lifecycle-happy-path.spec.ts` — Test 1
- `e2e/lifecycle-loop-back.spec.ts` — Tests 2, 3, 4
- `e2e/lifecycle-abandon.spec.ts` — Test 5
- `e2e/lifecycle-circuit-breaker.spec.ts` — Test 6

These require mocking the CI webhook responses and agent loop output.
