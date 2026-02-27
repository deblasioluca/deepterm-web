# DeepTerm Cockpit & DevOps Reorganization Plan

**Version:** 2.0
**Date:** 2026-02-27
**Status:** IN PROGRESS

---

## 1. Architecture Decision: Cockpit vs DevOps Split

### Problem
The Cockpit tries to be both an operational dashboard AND a development pipeline manager (13 tabs). This creates cognitive overload and mixes concerns.

### Decision
Split into two top-level sidebar items:
- **Cockpit** → "Is everything running?" (operational monitoring)
- **DevOps** → "What are we building?" (development pipeline)

### Agent Loop Decision
Agent Loop is removed as a standalone tab. Agent status is already reflected in Lifecycle's "Implement" step. Detailed agent logs/traces become a drill-down panel accessible from within the Implement gate ("View Agent Logs" link).

---

## 2. New Left Sidebar Structure

```
Dashboard
Cockpit          → Overview | System Health | AI Usage
DevOps           → Triage | Backlog | Planning | Lifecycle | Code & PRs | Builds | Pipelines
Users
Teams
Licenses
Subscriptions
Analytics
Audit Logs
Feedback
Issues
Announcements
AI Config        (keep — remove AI tab from Settings)
Settings         (General, Security, Billing, Notifications, Releases, Integrations, Danger Zone)
```

---

## 3. Cockpit (3 tabs — operational monitoring)

| # | Tab | Contents |
|---|-----|----------|
| 1 | **Overview** | KPI cards (users, revenue, issues), system status summary (all 7), recent alerts, quick actions |
| 2 | **System Health** | All 7 systems detailed: Pi, CI Mac, Web App, GitHub, Node-RED, AI Dev Mac, Airflow |
| 3 | **AI Usage** | Token spend, cost breakdown, model usage, per-activity stats |

---

## 4. DevOps (7 tabs — development pipeline flow)

| # | Tab | Contents | Flow |
|---|-----|----------|------|
| 1 | **Triage** | Incoming bugs/features → approve/reject/defer | Input |
| 2 | **Backlog** | Approved items awaiting planning | Queue |
| 3 | **Planning** | Epics, stories, priorities, sprint planning | Organize |
| 4 | **Lifecycle** | Epic/story flow through gates (agent drill-down in Implement step) | Execute |
| 5 | **Code & PRs** | Reviews + Pull Requests + Activity (sub-tabs) | Review |
| 6 | **Builds** | Build history, CI/E2E triggers, GitHub Actions runs | Build |
| 7 | **Pipelines** | DAG overview + recent runs, Scheduled DAGs, All DAGs (sub-tabs) | Orchestrate |

---

## 5. System Consistency (7 systems everywhere)

| System | Cockpit Overview | System Health | Settings Integrations |
|--------|:---:|:---:|:---:|
| Raspberry Pi | ✅ show | ✅ show | ✅ show |
| CI Mac | ✅ show | ✅ show | ✅ add |
| Web App (Next.js/PM2) | ✅ add | ✅ add | ✅ add |
| GitHub | ✅ add | ✅ add | ✅ exists |
| Node-RED | ✅ show | ✅ show | ✅ exists |
| AI Dev Mac | ✅ add | ✅ add | ✅ exists |
| Airflow | ✅ add | ✅ add | ✅ exists |

---

## 6. Lifecycle Bugs to Fix

| Bug | Fix |
|-----|-----|
| a) No auto-update when step finishes | Add 10s polling when any step is active |
| b) Implement gate active during deliberation | Show "pending" while deliberation still running |
| c) Progress 1/6 left vs 3/8 right | Align to same count everywhere |
| d) Only 1 of 3 stories visible | Include backlog stories from active epics |

---

## 7. Implementation Phases

### Phase 1: Fix Lifecycle Bugs ⬜
- [ ] 1.1 Add 10s polling to LifecycleTab when active steps exist
- [ ] 1.2 Fix implement gate: pending while deliberation running
- [ ] 1.3 Align progress count left = right
- [ ] 1.4 Include backlog stories from active epics in lifecycle API
- [ ] 1.5 Test full lifecycle flow with test epic

### Phase 2: Create DevOps Page ⬜
- [ ] 2.1 Create /admin/devops/page.tsx with 7 tabs
- [ ] 2.2 Move Triage, Backlog, Planning, Lifecycle tabs to DevOps
- [ ] 2.3 Create CodeAndPRsTab (Reviews + PRs + Activity sub-tabs)
- [ ] 2.4 Move Builds tab to DevOps
- [ ] 2.5 Move Pipelines tab to DevOps
- [ ] 2.6 Add DevOps to sidebar in layout.tsx

### Phase 3: Slim Down Cockpit ⬜
- [ ] 3.1 Reduce Cockpit to 3 tabs: Overview, System Health, AI Usage
- [ ] 3.2 Update Overview with all 7 system status cards
- [ ] 3.3 Move quick action buttons (Trigger CI, Run E2E) to DevOps Builds tab
- [ ] 3.4 Remove old standalone tabs from Cockpit (Reviews, PRs, Activity, Agent Loop, Builds, Backlog, Triage, Planning, Lifecycle, Pipelines)

### Phase 4: System Consistency ⬜
- [ ] 4.1 Define canonical 7-system list with health check endpoints
- [ ] 4.2 Update SystemHealthTab for all 7 systems
- [ ] 4.3 Update OverviewTab system cards for all 7
- [ ] 4.4 Update Settings IntegrationsTab (add CI Mac, Pi, Web App)
- [ ] 4.5 Remove AI tab from Settings (keep /admin/ai)
- [ ] 4.6 Add health check API endpoints for new systems

### Phase 5: Pipelines & Agent Drill-down ⬜
- [ ] 5.1 Add sub-tabs to Pipelines: Overview+Runs, Scheduled, All DAGs
- [ ] 5.2 Remove non-implementation DAGs
- [ ] 5.3 Add agent log drill-down panel to Lifecycle Implement step
- [ ] 5.4 Remove standalone Agent Loop tab

### Phase 6: Polish & Testing ⬜
- [ ] 6.1 E2E lifecycle test with test epic
- [ ] 6.2 Verify all quick actions work
- [ ] 6.3 Verify all 7 health checks
- [ ] 6.4 Final commit and push

---

## 8. Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `src/app/admin/devops/page.tsx` | CREATE — new DevOps page with 7 tabs | P2 |
| `src/app/admin/layout.tsx` | MODIFY — add DevOps sidebar item | P2 |
| `src/app/admin/cockpit/page.tsx` | MODIFY — reduce to 3 tabs | P3 |
| `src/app/admin/cockpit/components/LifecycleTab.tsx` | MODIFY — polling, progress, backlog | P1 |
| `src/app/admin/cockpit/components/DevLifecycleFlow.tsx` | MODIFY — fix implement gate, add agent drill-down | P1+P5 |
| `src/app/admin/devops/components/CodeAndPRsTab.tsx` | CREATE — Reviews + PRs + Activity | P2 |
| `src/app/admin/cockpit/components/SystemHealthTab.tsx` | MODIFY — all 7 systems | P4 |
| `src/app/admin/cockpit/components/OverviewTab.tsx` | MODIFY — all 7 system cards | P4 |
| `src/app/admin/cockpit/components/PipelinesTab.tsx` | MODIFY — sub-tabs | P5 |
| `src/app/admin/settings/page.tsx` | MODIFY — remove AI tab | P4 |
| `src/app/admin/settings/components/IntegrationsTab.tsx` | MODIFY — add 3 systems | P4 |
| `src/app/api/admin/cockpit/lifecycle/route.ts` | MODIFY — backlog from active epics | P1 |
| `src/app/api/admin/cockpit/health/route.ts` | MODIFY — new health checks | P4 |

---

## 9. Progress Tracking

| Phase | Status | Started | Completed | Notes |
|-------|--------|---------|-----------|-------|
| Phase 1: Lifecycle Bugs | ⬜ | | | |
| Phase 2: Create DevOps | ⬜ | | | |
| Phase 3: Slim Cockpit | ⬜ | | | |
| Phase 4: System Consistency | ⬜ | | | |
| Phase 5: Pipelines + Agent | ⬜ | | | |
| Phase 6: Polish | ⬜ | | | |

---

## 10. Chat Recovery

**Start new chat with:**
> "Continue cockpit/devops reorganization. Read /home/macan/deepterm/COCKPIT-REORG-PLAN.md on Pi (ssh macan@10.10.10.10). Shows full plan with progress."

**Key facts:**
- Pi SSH: ssh macan@10.10.10.10 (user: macan)
- Web app: /home/macan/deepterm (deepterm-web repo)
- Build: npm run build → pm2 restart deepterm
- Git: git add -A && git commit -m "..." && git push origin main
- Cockpit: http://10.10.10.10:3000/admin/cockpit
- Test epic: cmm4w6qmi0000vzo954ybzrd4 (Test Lifecycle Demo)
- Test stories: cmm4w6qmi0001vzo9p26qtk4b (dark mode), cmm4w6qmi0002vzo9i81wrh4e (SSH reconnect), cmm4w6qmi0003vzo9e4kzc65a (clipboard sync)
