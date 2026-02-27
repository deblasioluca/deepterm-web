# DeepTerm Cockpit Reorganization Plan

**Version:** 1.0
**Date:** 2026-02-27
**Status:** PLANNING

---

## 1. Current Issues & Questions Answered

### Q: What does "Trigger CI Build" do?
It dispatches `pr-check.yml` via GitHub Actions API on the `deepterm-web` repo (default) or a specified repo. It sends a `workflow_dispatch` event to GitHub, which the self-hosted CI Mac runner picks up. The CI Mac then builds, runs tests, and reports back. The "Run E2E Tests" button does the same but dispatches `e2e.yml`.

### Q: Lifecycle bugs identified
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| a) No auto-update when deliberation finishes | Lifecycle tab only fetches on mount + manual refresh, no polling | Add 10s polling interval while a step is "active" |
| b) Implement gate active during deliberation spin | Status derivation shows implement as waiting_approval too early | Fix: check if deliberation is still running and show "pending" for implement until decided |
| c) Progress 1/6 (left) vs 3/8 (right) | Left counts 6 phases, right counts 8 steps | Align to same count everywhere |
| d) Only 1 of 3 stories visible | API filters status IN (planned, in_progress, done) — backlog excluded | Include backlog stories from active epics |

### Q: AI Config overlap with Settings → AI tab
- `/admin/ai` page: Full AI provider management
- Settings → AI tab: Nearly identical
- **Decision:** Keep `/admin/ai` only. Remove AI tab from Settings.

### Q: Settings → Integrations missing systems
Current: GitHub, Node-RED, AI Dev Mac, Apache Airflow
Missing: CI Mac, Raspberry Pi, Web App
**Fix:** Add all 7 systems everywhere consistently.

### Q: Consistent system list
| System | Integrations | System Health | Overview |
|--------|:---:|:---:|:---:|
| Raspberry Pi | ✅ | ✅ | ✅ |
| CI Mac | ❌ add | ✅ | ✅ |
| Web App (Next.js/PM2) | ❌ add | ❌ add | ❌ add |
| GitHub | ✅ | ❌ add | ❌ add |
| Node-RED | ✅ | ✅ | ✅ |
| AI Dev Mac | ✅ | ❌ add | ❌ add |
| Airflow | ✅ | ❌ add | ❌ add |

---

## 2. Cockpit Tab Reorganization

### Current (13 tabs):
Overview, Backlog, Triage, Planning, Lifecycle, Pipelines, Reviews, Pull Requests, System Health, Builds, Activity, Agent Loop, AI Usage

### Proposed (10 tabs, logical flow):

| # | Tab | Contents | Rationale |
|---|-----|----------|-----------|
| 1 | **Overview** | Dashboard cards, system status, recent activity | Entry point |
| 2 | **Triage** | Incoming bugs/features → approve/reject/defer | First step |
| 3 | **Backlog** | Approved items awaiting planning | After triage |
| 4 | **Planning** | Epics, stories, priorities | Bundle backlog |
| 5 | **Lifecycle** | Epic/story flow through stages | Track WIP |
| 6 | **Code & PRs** | Reviews + Pull Requests + Activity (sub-tabs) | All code activity |
| 7 | **Agent Loop** | AI agent sessions, logs | AI dev tracking |
| 8 | **Builds** | Build history, triggers, GitHub Actions | Build/deploy |
| 9 | **Pipelines** | DAG overview, scheduled, all DAGs (sub-tabs) | Orchestration |
| 10 | **System Health** | All 7 systems + AI usage summary | Infrastructure |

### Pipelines sub-tabs:
- Overview & Recent Runs
- Scheduled DAGs (only 5 active)
- All DAGs

---

## 3. Implementation Phases

### Phase 1: Fix Lifecycle Bugs ⬜
- [ ] 1.1 Add polling (10s) to LifecycleTab when active steps exist
- [ ] 1.2 Fix implement gate: pending while deliberation running
- [ ] 1.3 Align progress count (left = right)
- [ ] 1.4 Include backlog stories from active epics in API
- [ ] 1.5 Test full lifecycle flow

### Phase 2: Cockpit Tab Reorder & Merge ⬜
- [ ] 2.1 Reorder TABS array
- [ ] 2.2 Create CodeAndPRsTab (Reviews + PRs + Activity sub-tabs)
- [ ] 2.3 Move AI Usage into System Health
- [ ] 2.4 Remove old standalone tabs
- [ ] 2.5 Test all tabs

### Phase 3: System Consistency ⬜
- [ ] 3.1 Define canonical 7-system list
- [ ] 3.2 Update SystemHealthTab for all 7
- [ ] 3.3 Update OverviewTab for all 7
- [ ] 3.4 Update IntegrationsTab (add CI Mac, Pi, Web App)
- [ ] 3.5 Remove AI tab from Settings
- [ ] 3.6 Add health check endpoints for new systems

### Phase 4: Pipelines Cleanup ⬜
- [ ] 4.1 Add sub-tabs to PipelinesTab
- [ ] 4.2 Remove non-implementation DAGs
- [ ] 4.3 Connect triggers to GitHub dispatch

### Phase 5: Polish & Testing ⬜
- [ ] 5.1 E2E lifecycle test
- [ ] 5.2 Verify quick actions
- [ ] 5.3 Verify health checks
- [ ] 5.4 Final commit

---

## 4. Files to Modify

| File | Changes |
|------|---------|
| `page.tsx` (cockpit) | Reorder TABS, add CodeAndPRsTab, remove old tabs |
| `LifecycleTab.tsx` | Polling, progress count, backlog stories |
| `DevLifecycleFlow.tsx` | Fix implement gate status |
| `CodeAndPRsTab.tsx` | NEW: Reviews + PRs + Activity |
| `SystemHealthTab.tsx` | All 7 systems + AI usage |
| `OverviewTab.tsx` | All 7 system status |
| `PipelinesTab.tsx` | Sub-tabs, DAG cleanup |
| `settings/page.tsx` | Remove AI tab |
| `IntegrationsTab.tsx` | Add CI Mac, Pi, Web App |
| `lifecycle/route.ts` | Backlog stories from active epics |
| `health/route.ts` | New system health checks |

---

## 5. Progress Tracking

| Phase | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| Phase 1: Lifecycle Bugs | ⬜ | | | |
| Phase 2: Tab Reorder | ⬜ | | | |
| Phase 3: System Consistency | ⬜ | | | |
| Phase 4: Pipelines Cleanup | ⬜ | | | |
| Phase 5: Polish | ⬜ | | | |

---

## 6. Chat Recovery

**Start new chat with:**
> "Continue cockpit reorganization. Read /home/macan/deepterm/COCKPIT-REORG-PLAN.md on Pi (ssh macan@10.10.10.10). Shows what's done and next."

**Key facts:**
- Pi SSH: ssh macan@10.10.10.10 (user: macan)
- Web app: /home/macan/deepterm (deepterm-web repo)
- Build: npm run build → pm2 restart deepterm
- Git: git add -A && git commit && git push origin main
- Cockpit: http://10.10.10.10:3000/admin/cockpit
- Test epic: cmm4w6qmi0000vzo954ybzrd4 (Test Lifecycle Demo)
- Test stories: cmm4w6qmi0001vzo9p26qtk4b (dark mode), cmm4w6qmi0002vzo9i81wrh4e (SSH reconnect), cmm4w6qmi0003vzo9e4kzc65a (clipboard sync)
