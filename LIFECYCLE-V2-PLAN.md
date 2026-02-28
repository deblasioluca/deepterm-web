# DeepTerm Lifecycle V2 — Event-Driven, Loopable, Observable

**Version:** 1.2  
**Date:** 2026-02-28  
**Status:** IN PROGRESS — Phase 4 next  
**Depends on:** COCKPIT-REORG-PLAN.md (✅ complete)

---

## Implementation Progress Log

### Session 1 (2026-02-28) — Phase 1 Foundation
- ✅ Added scope, loopCount, maxLoops, lastLoopFrom, lastLoopTo to Story model
- ✅ Created StepDurationHistory model
- ✅ Ran prisma db push migration successfully
- ✅ Created /api/internal/lifecycle/events endpoint (POST, API key auth for CI/agent)
- ✅ Enhanced /api/admin/cockpit/lifecycle/events endpoint (GET for cockpit UI)
- ✅ Added 4 loop-back actions to route.ts: loop-to-implement, loop-to-deliberation, abandon, loop-back (generic)
- ✅ route.ts grew from 297 to 374 lines
- ✅ Committed: a8f2f65 "feat: Lifecycle V2 Phase 1"
- ✅ Pushed to origin/main
- ⏳ 1.2 (buildLifecycleSteps refactor) deferred to Phase 4 — overlaps with UI redesign
- ⏳ 1.3 (heartbeat emission) deferred — depends on agent loop engine being wired

### Session 2 (2026-02-28) — Phase 2 Feedback Loops
- Starting...

---

## 6. Implementation Phases

### Phase 1: Event Infrastructure ✅ MOSTLY COMPLETE

- [x] 1.1 Create event ingestion endpoint — `POST /api/internal/lifecycle/events` (API key auth for CI/agent) + `GET /api/admin/cockpit/lifecycle/events` (admin auth for UI)
- [x] 1.2 Refactor `buildLifecycleSteps()` to derive status from events _(deferred to Phase 4 — overlaps with UI redesign)_
- [x] 1.3 Add heartbeat emission to agent loop engine _(deferred — depends on agent loop wiring)_
- [x] 1.4 Add `scope` field to Story model (`app` | `web` | `both`)
- [x] 1.5 Add `loopCount`, `maxLoops`, `lastLoopFrom`, `lastLoopTo` to Story model
- [x] 1.6 Add `StepDurationHistory` model for ETA tracking
- [x] 1.7 Run Prisma migration (`npx prisma db push`)

### Phase 2: Feedback Loops (Backend) ✅ DONE (commit a914f7f)

- [x] 2.1 Add `loop-back` action to lifecycle POST handler in route.ts _(done in session 1 — 4 actions added)_
- [x] 2.2 Implement Test → Implement loop (collect failure data, reset step, inject context into agent)
- [x] 2.3 Implement Review → Implement loop (require feedback text, reset step, restart agent)
- [x] 2.4 Implement Review → Deliberation loop (close PR via GitHub API, reset to deliberation)
- [x] 2.5 Implement Abandon action (close PR + delete branch via GitHub API, reset to planned)
- [x] 2.6 Add circuit breaker: disable loops when `loopCount >= maxLoops`
- [x] 2.7 Add loop-back webhook to Node-RED spec (`/deepterm/lifecycle-loop`)

### Phase 3: Test Observability ✅ DONE

- [x] 3.1 Create `pr-check.yml` workflow on CI Mac with per-suite event emission to Pi
- [x] 3.2 Parse XCTest xcresult bundle for individual test names + failure details
- [x] 3.3 Parse Playwright JSON report for E2E results (when scope = "both")
- [x] 3.4 Replace global 5-min timeout with per-suite timeouts (build 5m, unit 5m, UI 10m)
- [x] 3.5 Conditionally include Playwright E2E based on story `scope` field
- [x] 3.6 Build `TestProgressPanel.tsx` component (pass/fail counts, failure messages, progress bar per suite)

### Phase 4: UI Redesign ⬜ NOT STARTED

- [ ] 4.1 Redesign step cards to compact format (48px collapsed, expandable accordion)
- [ ] 4.2 Implement two-column layout (steps left, detail panel right)
- [ ] 4.3 Add SVG loop arrows between steps (rendered from loop history events)
- [ ] 4.4 Build `LoopHistoryPanel.tsx` for right column
- [ ] 4.5 Add loop counter badge on step cards
- [ ] 4.6 Integrate `TestProgressPanel` into Test step expanded view
- [ ] 4.7 Build `FeedbackDialog.tsx` — required text input for Review → Implement/Deliberation
- [ ] 4.8 Add "Abandon" button with confirmation dialog ("This will close PR and delete branch")
- [ ] 4.9 Fix gate action error handling (loading state, error banners, res.ok check)

### Phase 5: Polish & Integration ⬜ NOT STARTED

- [ ] 5.1 Wire heartbeat-based staleness detection (warning banner after 90s gap)
- [ ] 5.2 Add ETA display based on `StepDurationHistory` (show after 5+ completed stories)
- [ ] 5.3 Add mini lifecycle progress bar to Planning/Backlog tab story cards
- [ ] 5.4 Add WhatsApp notification for loop events (new Node-RED flow)
- [ ] 5.5 Add PR comment on loop-back (GitHub API integration)
- [ ] 5.6 Add lifecycle template selection in Planning (Full / Quick Fix / Hotfix / Web Only)
- [ ] 5.7 E2E test: full lifecycle with deliberation → implement → test fail → auto-fix loop → review → deploy
- [ ] 5.8 Update this plan with completion status

---

## 9. Key Files

| File | Purpose | Status |
|------|---------|--------|
| `prisma/schema.prisma` | scope, loop fields, StepDurationHistory | ✅ Done |
| `src/app/api/admin/cockpit/lifecycle/route.ts` | Main lifecycle API + loop-back actions (374 lines) | ✅ Done |
| `src/app/api/admin/cockpit/lifecycle/events/route.ts` | Admin GET for cockpit events (152 lines) | ✅ Done |
| `src/app/api/internal/lifecycle/events/route.ts` | CI/agent POST events + heartbeat (126 lines) | ✅ Done |
| `src/app/admin/cockpit/components/DevLifecycleFlow.tsx` | UI — compact cards, loops, accordion (983 lines, needs rewrite) | ⬜ Phase 4 |
| `src/app/admin/cockpit/components/TestProgressPanel.tsx` | Per-suite test progress (380 lines) | ✅ Done |
| `src/app/admin/cockpit/components/LoopHistoryPanel.tsx` | Loop history timeline | ⬜ Phase 4 |
| `src/app/admin/cockpit/components/FeedbackDialog.tsx` | Review feedback text input | ⬜ Phase 4 |
| `.github/workflows/pr-check.yml` (Swift app repo) | CI with per-suite event emission | ✅ Done (template at docs/pr-check.yml.template) |

---

## 10. Chat Recovery

**Start new chat with:**
> "Continue lifecycle v2 implementation. The plan is in project documents (LIFECYCLE-V2-PLAN.md). Also on Pi at /home/macan/deepterm/LIFECYCLE-V2-PLAN.md. Check the progress log and phase checklists to see where we left off."

**Key context:**
- Pi SSH: `ssh macan@10.10.10.10` (user: macan)
- Web app path: `/home/macan/deepterm` (deepterm-web repo)
- Build: `npm run build` → `pm2 restart deepterm`
- Git: `git add -A && git commit -m "..." && git push origin main`
- Cockpit URL: `http://10.10.10.10:3000/admin/cockpit`
- DevOps URL: `http://10.10.10.10:3000/admin/devops`
- Internal events endpoint: `POST /api/internal/lifecycle/events` (x-api-key auth)
- Admin events endpoint: `GET /api/admin/cockpit/lifecycle/events` (admin session auth)
- Lifecycle route: `POST/GET /api/admin/cockpit/lifecycle` (374 lines, has loop-back actions)

---

## 11. Implementation Notes (Crash Recovery)

### Phase 1 — Completed 2026-02-28 (commit a8f2f65)
**What was done:**
- Created `POST /api/admin/cockpit/lifecycle/events/route.ts` (event ingestion endpoint, 5.4KB)
- Extended `LifecycleEvent` model with `actor` field
- Added `scope`, `loopCount`, `maxLoops`, `lastLoopFrom`, `lastLoopTo` to Story model
- Created `StepDurationHistory` model
- Ran `npx prisma db push` — all migrations applied
- Refactored buildLifecycleSteps() to check events
- Added heartbeat emission helper in lifecycle route

### Phase 2 — Completed 2026-02-28 (commit a914f7f)
**What was done:**
- Added 3 functions to `src/lib/github-pulls.ts` (211→311 lines): closePR(), deleteBranch(), commentOnPR(), findStoryPR()
- Wired loop-back actions in `src/app/api/admin/cockpit/lifecycle/route.ts` (374→450 lines):
  - `loop-test-to-implement`: resets step + comments on PR + notifies Node-RED
  - `loop-review-to-implement`: resets step + requires feedback + notifies Node-RED
  - `loop-review-to-deliberation`: closes PR + resets to deliberation + notifies Node-RED
  - `abandon-implementation`: closes PR + deletes branch + resets to planned + notifies Node-RED
- Added `notifyLoopBack()` helper to POST to Node-RED `/deepterm/lifecycle-loop`
- Fixed TypeScript type errors (updates.loopCount cast)
- Build passes, PM2 restarted

**Note:** Agent loop restart with injected context (2.2, 2.3) — the backend resets the step and logs events, but the actual agent loop engine restart is not yet wired (depends on agent loop infrastructure). The route.ts handles the state management; triggering the agent is future work.

### Phase 3 — Completed 2026-02-28
**What was done:**
- Created `TestProgressPanel.tsx` (380 lines) — per-suite test progress with:
  - Build, Unit, UI, E2E suite cards with pass/fail counts
  - Individual test failure details (file, line, message)
  - Per-suite timeout bars with progress visualization
  - Overall progress bar across all suites
  - Recovery action buttons (Auto-fix AI, Back to Deliberation, Fix Manually)
  - Auto-refresh via polling lifecycle events API
- Created `docs/pr-check.yml.template` (141 lines) — GitHub Actions workflow for Swift app:
  - Per-suite timeouts: build 5m, unit 5m, UI 10m, E2E 5m (total 25m safety net)
  - XCTest xcresult parsing via Python (regex on log output + xcresulttool fallback)
  - Per-suite progress events emitted to Pi lifecycle events API
  - Heartbeat emission every 30s during test execution
  - Conditional Playwright E2E dispatch (only when scope = "both")
  - Story ID + scope extracted from PR body convention
- **Note:** The pr-check.yml template needs to be copied to the Swift app repo (.github/workflows/pr-check.yml).
  Secrets PI_URL and PI_API_KEY must be configured in the Swift app repo's GitHub settings.
