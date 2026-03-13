# DeepTerm Lifecycle V2 — Event-Driven, Loopable, Observable

**Version:** 1.1
**Date:** 2026-03-13
**Status:** PHASES 1–5 COMPLETE ✅
**Depends on:** COCKPIT-REORG-PLAN.md (✅ complete)

---

## Phase Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Event Infrastructure | ✅ DONE | events endpoint, buildLifecycleSteps, heartbeat, schema |
| Phase 2: Feedback Loops (Backend) | ✅ DONE | All 5 loop-back actions in route.ts |
| Phase 3: Test Observability | ✅ DONE | pr-check.yml, TestProgressPanel, per-suite timeouts |
| Phase 4: UI Redesign | ✅ DONE | Compact cards, accordion, loop arrows, FeedbackDialog |
| Phase 5: Polish & Integration | ✅ DONE | Heartbeat staleness, ETA, mini bar, WhatsApp, PR comments |

---

## 6. Implementation Phases (Detailed)

### Phase 1: Event Infrastructure ✅ DONE
- [x] 1.1 POST /api/admin/cockpit/lifecycle/events — authenticated CI/agent event ingestion
- [x] 1.2 Refactor buildLifecycleSteps() to derive status from events
- [x] 1.3 Heartbeat emission in agent loop engine
- [x] 1.4 scope field on Story (app | web | both)
- [x] 1.5 loopCount, maxLoops, lastLoopFrom, lastLoopTo on Story
- [x] 1.6 StepDurationHistory model for ETA tracking
- [x] 1.7 Prisma migration (npx prisma db push)

### Phase 2: Feedback Loops (Backend) ✅ DONE
- [x] 2.1 loop-back action in lifecycle POST handler
- [x] 2.2 Test → Implement loop (failure context, reset step, inject context)
- [x] 2.3 Review → Implement loop (require feedback text, restart agent)
- [x] 2.4 Review → Deliberation loop (close PR via GitHub API, reset)
- [x] 2.5 Abandon action (close PR + delete branch via GitHub API, reset to planned)
- [x] 2.6 Circuit breaker (loopCount >= maxLoops)
- [x] 2.7 /deepterm/lifecycle-loop webhook to Node-RED (notifyLoopBack)

### Phase 3: Test Observability ✅ DONE
- [x] 3.1 POST /api/admin/cockpit/lifecycle/events endpoint (Phase 1.1)
- [x] 3.2 Parse XCTest failures in pr-check.yml (regex on test.log/uitest.log → JSON)
- [x] 3.3 Playwright JSON parsing (when scope = both — conditional in TestProgressPanel)
- [x] 3.4 Per-suite timeouts in route.ts: SUITE_TIMEOUTS = {build:300, unit:300, ui:600, e2e:300}
- [x] 3.5 Scope-conditional E2E in TestProgressPanel
- [x] 3.6 TestProgressPanel.tsx (8709 bytes, polls events, SuiteRow, timeout bars)

### Phase 4: UI Redesign ✅ DONE
- [x] 4.1 Compact step cards (collapsed ~48px, expandable accordion)
- [x] 4.2 Two-column layout (steps left, detail panel right)
- [x] 4.3 SVG loop arrows (LoopArrowsSVG inline, parseLoopArrows from events)
- [x] 4.4 LoopHistoryPanel.tsx (4604 bytes)
- [x] 4.5 Loop counter badges on step cards
- [x] 4.6 TestProgressPanel integrated into Test step expanded view
- [x] 4.7 FeedbackDialog.tsx (5717 bytes, required text for Review loops)
- [x] 4.8 Abandon button with confirmation (open-feedback-abandon action)
- [x] 4.9 Gate action error handling (res.ok check, loading state, error banners)

### Phase 5: Polish & Integration ✅ DONE
- [x] 5.1 Heartbeat staleness detection (90s gap warning in expanded step card)
- [x] 5.2 ETA display from StepDurationHistory (p50/p90 after 5+ stories)
- [x] 5.3 Mini lifecycle progress bar in PlanningTab story cards (MiniLifecycleBar)
- [x] 5.4 WhatsApp notification for loop events (notifyLoopBack → Node-RED /deepterm/lifecycle-loop)
- [x] 5.5 PR comment on loop-back (commentOnPR in all loop actions)
- [x] 5.6 Lifecycle template selection in Planning (Full / Quick Fix / Hotfix / Web Only)
- [ ] 5.7 E2E test: full lifecycle with auto-fix loop (manual verification pending)
- [x] 5.8 This plan updated with completion status ✅ 2026-03-13

---

## 7. Updated Node-RED Webhook Spec

| Endpoint (POST to Node-RED) | When | Payload Keys |
|-----|------|------|
| /deepterm/lifecycle-loop | Loop-back triggered | event, storyId, storyTitle, fromStep, toStep, reason, loopCount, maxLoops |

---

## 8. Key Files (as-built)

| File | Status |
|------|--------|
| prisma/schema.prisma | ✅ loopCount, maxLoops, lastLoopFrom, lastLoopTo, scope, lifecycleTemplate, StepDurationHistory |
| src/app/api/admin/cockpit/lifecycle/route.ts | ✅ 1146 lines, all loop-back actions |
| src/app/api/admin/cockpit/lifecycle/events/route.ts | ✅ 185 lines, POST+GET |
| src/app/admin/cockpit/components/DevLifecycleFlow.tsx | ✅ 1683 lines, compact cards, loop arrows, accordion |
| src/app/admin/cockpit/components/TestProgressPanel.tsx | ✅ 8709 bytes |
| src/app/admin/cockpit/components/LoopHistoryPanel.tsx | ✅ 4604 bytes |
| src/app/admin/cockpit/components/FeedbackDialog.tsx | ✅ 5717 bytes |
| src/app/admin/cockpit/components/PlanningTab.tsx | ✅ 1244 lines, MiniLifecycleBar at line 92 |
| .github/workflows/pr-check.yml (Swift repo) | ✅ build+test+failure parsing+Pi callbacks |

---

## 9. Chat Recovery

**Start new chat with:**
> "Lifecycle V2 is complete (Phases 1-5). Status in LIFECYCLE-V2-PLAN.md on Pi at /home/macan/deepterm. Next: Phase 5.7 manual E2E verification, or move to next feature."

**Key context:**
- Pi SSH: ssh macan@10.10.10.10
- Web app: /home/macan/deepterm
- Build: npm run build → pm2 restart deepterm
- Git: git add -A && git commit -m "..." && git push origin main
- CI Mac: ssh lucadeblasio@192.168.1.248
- Swift repo workflows: ~/Development/deepterm/.github/workflows/
