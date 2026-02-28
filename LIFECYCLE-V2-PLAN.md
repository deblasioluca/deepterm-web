# DeepTerm Lifecycle V2 — Event-Driven, Loopable, Observable

**Version:** 1.1  
**Date:** 2026-02-28  
**Status:** IN PROGRESS — Phase 2 next  
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
- [ ] 1.2 Refactor `buildLifecycleSteps()` to derive status from events _(deferred to Phase 4 — overlaps with UI redesign)_
- [ ] 1.3 Add heartbeat emission to agent loop engine _(deferred — depends on agent loop wiring)_
- [x] 1.4 Add `scope` field to Story model (`app` | `web` | `both`)
- [x] 1.5 Add `loopCount`, `maxLoops`, `lastLoopFrom`, `lastLoopTo` to Story model
- [x] 1.6 Add `StepDurationHistory` model for ETA tracking
- [x] 1.7 Run Prisma migration (`npx prisma db push`)

### Phase 2: Feedback Loops (Backend) ⬜ IN PROGRESS

- [x] 2.1 Add `loop-back` action to lifecycle POST handler in route.ts _(done in session 1 — 4 actions added)_
- [ ] 2.2 Implement Test → Implement loop (collect failure data, reset step, inject context into agent)
- [ ] 2.3 Implement Review → Implement loop (require feedback text, reset step, restart agent)
- [ ] 2.4 Implement Review → Deliberation loop (close PR via GitHub API, reset to deliberation)
- [ ] 2.5 Implement Abandon action (close PR + delete branch via GitHub API, reset to planned)
- [ ] 2.6 Add circuit breaker: disable loops when `loopCount >= maxLoops`
- [ ] 2.7 Add loop-back webhook to Node-RED spec (`/deepterm/lifecycle-loop`)

### Phase 3: Test Observability ⬜ NOT STARTED

- [ ] 3.1 Create `pr-check.yml` workflow on CI Mac with per-suite event emission to Pi
- [ ] 3.2 Parse XCTest xcresult bundle for individual test names + failure details
- [ ] 3.3 Parse Playwright JSON report for E2E results (when scope = "both")
- [ ] 3.4 Replace global 5-min timeout with per-suite timeouts (build 5m, unit 5m, UI 10m)
- [ ] 3.5 Conditionally include Playwright E2E based on story `scope` field
- [ ] 3.6 Build `TestProgressPanel.tsx` component (pass/fail counts, failure messages, progress bar per suite)

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
| `src/app/admin/cockpit/components/TestProgressPanel.tsx` | Per-suite test progress | ⬜ Phase 3 |
| `src/app/admin/cockpit/components/LoopHistoryPanel.tsx` | Loop history timeline | ⬜ Phase 4 |
| `src/app/admin/cockpit/components/FeedbackDialog.tsx` | Review feedback text input | ⬜ Phase 4 |
| `.github/workflows/pr-check.yml` (Swift app repo) | CI with per-suite event emission | ⬜ Phase 3 |

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
