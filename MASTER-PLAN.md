# DeepTerm Master Plan

**Version:** 3.0  
**Date:** 2026-03-13  
**Status:** LIVING DOCUMENT — update this file when anything ships or changes  
**Replaces:** deepterm-master-plan-v2.2.docx, COCKPIT-REORG-PLAN.md, LIFECYCLE-V2-PLAN.md, CI-INTEGRATION-STATUS.md

---

## How to Use This File

- **Every session:** Check status before starting. Update checkboxes when done.
- **"Weiter" / "Continue":** Pick the first unchecked item under **Next Up**.
- **Do NOT** refer to old plan files (v2.2.docx, LIFECYCLE-V2-PLAN.md, etc.) — this file is the truth.
- **Recovery prompt:** "Continue DeepTerm. Master plan is at `/home/macan/deepterm/MASTER-PLAN.md` on the Pi."

---

## Infrastructure Reference (Stable)

| Component | Details |
|-----------|---------|
| Pi SSH | `macan@10.10.10.10` |
| Pi app path | `/home/macan/deepterm` (deepterm-web repo) |
| Pi build | `npm run build` → `pm2 restart deepterm` |
| Pi git | `git add -A && git commit -m "..." && git push origin main` |
| CI Mac SSH | `lucadeblasio@192.168.20.198` |
| CI Mac app | `~/Development/deepterm` (Swift repo) |
| GitHub repos | `deblasioluca/deepterm` (Swift), `deblasioluca/deepterm-web` (Pi/web) |
| Cockpit URL | `http://10.10.10.10:3000/admin/cockpit` |
| DevOps URL | `http://10.10.10.10:3000/admin/devops` |
| GITHUB_TOKEN | Pi `.env` → `GITHUB_TOKEN` |
| API key | Pi `.env` → `AI_DEV_API_KEY` |
| Apple Team ID | `54344JBE7L` |
| deepterm.net | Public docs site |
| **Tailscale — Pi** | `100.96.166.43` (rp5m3) |
| **Tailscale — CI Mac** | `100.103.71.66` (ci-mac-1) |
| **Tailscale — Dev Mac** | `100.107.108.33` (lucas-mini-6237) |
| **Cockpit via Tailscale** | `http://100.96.166.43:3000/admin/cockpit` |

---

## Workstream A — Epic-Level Deploy & Release

**Goal:** Story lifecycle ends at `merged`. Epic owns Deploy + Release.  
Story flow: `triage → plan → deliberation → implement → test → review → [merged ✓]`  
Epic flow: `(all stories merged) → DEPLOY → RELEASE`

| # | Item | Status | Commit |
|---|------|--------|--------|
| A1 | Schema: `epicLifecycleStep`, `epicDeployStarted`, `epicReleasedAt` on Epic | ✅ DONE | `44f602f` |
| A2 | Story templates end at `review` (no deploy/release in templates) | ✅ DONE | `44f602f` |
| A3 | `merge-pr` success path → `merged` + sibling check + epic gate | ✅ DONE | `44f602f` |
| A4 | `epic-deploy` + `epic-release` actions in route.ts | ✅ DONE | `44f602f` |
| A5 | `EpicDeployBand` UI in DevLifecycleFlow.tsx | ✅ DONE | `e24a210` |
| A6 | `merge-pr` "no PR found" fallback → `merged` (not `deploy`) | ✅ DONE | `964f283` |
| A7 | `merge-pr` "PR already closed" fallback → `merged` (not `deploy`) | ✅ DONE | `964f283` |
| A8 | `approve-pr` action → `merged` (not `deploy`) | ✅ DONE | `964f283` |
| A9 | `doPostMergeEpicCheck()` helper extracted (no duplication) | ✅ DONE | `964f283` |

---

## Workstream B — Agent Context Window Resilience

**Goal:** No silent failures. Context overflow handled gracefully. Crashes resume from checkpoint.

| # | Item | Status | Commit |
|---|------|--------|--------|
| B1 | Error classification: `context_overflow`, `rate_limit`, `connection`, `api_error` | ✅ DONE | `44f602f` |
| B2 | Progressive summarization at 60% context pressure (Claude Haiku) | ✅ DONE | `44f602f` |
| B3 | Iteration checkpoints: `filesSnapshot`, `contextSummary`, `isCheckpoint` per iteration | ✅ DONE | `964f283` |
| B4 | Rate limit exponential backoff: 10s → 20s → 40s → 120s on 429/overloaded | ✅ DONE | `44f602f` |
| B5 | Recovery actions: `resume-from-checkpoint`, `split-task`, `reduce-scope` in route.ts | ✅ DONE | `964f283` |
| B6 | UI: context-aware gate buttons on failed implement (overflow → Resume/Reduce/Split) | ✅ DONE | `964f283` |
| B7 | `LifecycleTab.tsx` actionMap: 3 new recovery entries | ✅ DONE | `964f283` |

---

## Workstream C — release.yml Workflow (CI Mac)

**Goal:** Tag push or epic deploy gate → full signed DMG → GitHub Release → Pi upload → lifecycle callback.

| # | Item | Status | Commit |
|---|------|--------|--------|
| C1 | `release.yml`: checkout, pod install, xcodebuild archive | ✅ DONE | (Swift repo) |
| C2 | `release.yml`: xcodebuild -exportArchive (signed DMG) | ✅ DONE | (Swift repo) |
| C3 | `release.yml`: xcrun notarytool submit + stapler staple | ✅ DONE | (Swift repo) |
| C4 | `release.yml`: Create GitHub Release + upload DMG | ✅ DONE | (Swift repo) |
| C5 | `release.yml`: SSH to Pi + upload DMG + release notes | ✅ DONE | (Swift repo) |
| C6 | `release.yml`: POST to Pi lifecycle → advance epic to Release | ✅ DONE | (Swift repo) |
| C7 | `release.yml`: Node-RED → WhatsApp notification | ✅ DONE | (Swift repo) |

---

## Workstream D — Lifecycle Deficiency Fixes (GAP-01 through GAP-15)

| # | GAP | Fix | Status | Commit |
|---|-----|-----|--------|--------|
| D1 | GAP-04 | Polling exponential backoff + "Connection lost" banner | ✅ DONE | `7e2da0e` |
| D2 | GAP-10 | Inline "⚠ Timed out" banner with retry/auto-fix on compact card | ✅ DONE | `7e2da0e` |
| D3 | GAP-11 | "Tests: 550 ✓ / 64 UI ✓" sub-text in Review step | ✅ DONE | `02217a4` |
| D4 | GAP-15 | "Approve deliberation first" hint blocking Implement start | ✅ DONE | `7e2da0e` |
| D5 | GAP-07/08 | Expandable deliberation proposals + full decision text | ✅ DONE | `7e2da0e` |
| D6 | GAP-01–15 | All remaining GAP fixes | ✅ DONE | `7e2da0e` |

---

## Workstream E — CI Integration & Test Observability

| # | Item | Status | Commit |
|---|------|--------|--------|
| E1 | `pr-check.yml`: build + unit + UI tests with per-suite callbacks to Pi | ✅ DONE | Swift repo `a725623` |
| E2 | Middleware exception for `/api/admin/cockpit/lifecycle/events` | ✅ DONE | `82c1709` |
| E3 | `dispatchCIWorkflow()` from lifecycle retry-step | ✅ DONE | Pi route.ts |
| E4 | `TestProgressPanel.tsx`: per-suite build/unit/UI/E2E progress | ✅ DONE | `b0c284f` |
| E5 | Per-suite timeouts: build 5m, unit 5m, UI 10m, E2E 5m | ✅ DONE | `b0c284f` |
| E6 | Feedback loops: `loop-test-to-implement`, `loop-review-to-implement`, `loop-review-to-deliberation` | ✅ DONE | route.ts |
| E7 | Circuit breaker: `loopCount >= maxLoops` halts auto-fix | ✅ DONE | route.ts |
| E8 | `abandon-implementation`: close PR + delete branch via GitHub API | ✅ DONE | route.ts |
| E9 | UI tests showing 0/0 (XCUITest needs GUI session on CI Mac) | ⚠️ LOW PRIORITY | — |

---

## Workstream F — Cockpit & DevOps Reorganization

| # | Item | Status |
|---|------|--------|
| F1 | Cockpit → 3 tabs: Overview, System Health, AI Usage | ✅ DONE |
| F2 | DevOps → 7 tabs: Triage, Backlog, Planning, Lifecycle, Code & PRs, Builds, Pipelines | ✅ DONE |
| F3 | 7 systems consistent everywhere (Pi, CI Mac, Web App, GitHub, Node-RED, AI Dev Mac, Airflow) | ✅ DONE |
| F4 | Lifecycle V2: event-driven, compact cards, two-column, loop arrows, accordion | ✅ DONE |
| F5 | Pipelines tab Phase 5 (sub-tabs: Overview+Runs, Scheduled, All DAGs) | ✅ DONE |
| F6 | Agent drill-down in Implement step | ✅ DONE |

---

## Workstream G — Backend Infrastructure

| # | Item | Status | Commit |
|---|------|--------|--------|
| G1 | Token accumulation fix: `deleteMany` before `createTokenPair` | ✅ DONE | `90e8b19` |
| G2 | Cleanup cron: `/api/internal/cron/cleanup` + PM2 `deepterm-cleanup` daily at 3am | ✅ DONE | `90e8b19` |
| G3 | Biometric unified login: `BiometricKeyStore.storeKeys()` after `login()` in SessionManager.swift | ✅ DONE | Swift `e6e1b3b` |
| G4 | GitHub Issues created for planned ideas (#43 display modes, #44 terminal colors) | ✅ DONE | live |
| G5 | `GithubIssue` table synced via webhook (#43, #44 in DB) | ✅ DONE | live |

---

## Workstream H — Stripe & Payments

| # | Item | Status |
|---|------|--------|
| H1 | Stripe integration: checkout, webhook, subscription, portal | ✅ DONE |
| H2 | Test mode fully working | ✅ DONE |
| H3 | **Stripe Live migration** — guide in `STRIPE-LIVE-MIGRATION.md` | ⏳ TODO |
| H4 | Revenue dashboard in cockpit | ⏳ TODO |
| H5 | Apple App Store Server Notifications v2 | ⏳ TODO |

---

## Workstream I — Load Testing & Hardening (Phase 5)

| # | Item | Status |
|---|------|--------|
| I1 | SSH load testing harness | ⏳ TODO |
| I2 | Web (Next.js) load testing harness | ⏳ TODO |
| I3 | AI eval golden test suite + evaluation runner | ⏳ TODO |
| I4 | Tailscale remote cockpit access | ✅ DONE |
| I5 | End-to-end dry run of full pipeline (E2E smoke test) | ⏳ TODO |
| I6 | Security audit: rotate passwords, move hardcoded keys to env | ⏳ TODO |

---

## Workstream J — Security (Immediate)

| # | Item | Status |
|---|------|--------|
| J1 | Admin password changed from `admin123` | ⚠️ VERIFY |
| J2 | API key removed from IssueSubmissionService.swift | ⚠️ VERIFY |
| J3 | GitHub webhook secret: `openssl rand -hex 32` → Pi .env + GitHub secret | ⚠️ VERIFY |
| J4 | Node-RED admin UI authentication enabled | ⚠️ VERIFY |
| J5 | .p12 certificate file deleted after import | ⚠️ VERIFY |

---

## Next Up (in priority order)

1. **I1/I2** — Load testing harnesses (SSH + web)
2. **I3** — AI eval golden test suite + evaluation runner
3. **I5** — Full E2E smoke test (manual lifecycle dry run)
4. **I6** — Security audit: rotate passwords, move hardcoded keys to env
5. **J1–J5** — Security verification checklist
6. **H3** — Stripe Live (waiting until everything stable — guide in `STRIPE-LIVE-MIGRATION.md`)
7. **H4** — Revenue dashboard in cockpit
8. **H5** — Apple App Store Server Notifications v2
9. **E9** — UI tests (XCUITest needs GUI session on CI Mac)

---

## Key File Locations

| File | Location | Purpose |
|------|----------|---------|
| This plan | `/home/macan/deepterm/MASTER-PLAN.md` | Single source of truth |
| Stripe migration | `/home/macan/deepterm/STRIPE-LIVE-MIGRATION.md` | Step-by-step Stripe live |
| Lifecycle API | `src/app/api/admin/cockpit/lifecycle/route.ts` | ~1200 lines |
| DevLifecycleFlow | `src/app/admin/cockpit/components/DevLifecycleFlow.tsx` | ~1700 lines |
| LifecycleTab | `src/app/admin/cockpit/components/LifecycleTab.tsx` | ~720 lines |
| Agent engine | `src/lib/agent-loop/engine.ts` | ~942 lines |
| Prisma schema | `prisma/schema.prisma` | DB models |
| Token/auth | `src/lib/zk/jwt.ts` | createTokenPair, cleanup |
| SessionManager | `~/Development/deepterm/Sources/Views/SessionManager.swift` | Swift, CI Mac |
| pr-check.yml | `~/Development/deepterm/.github/workflows/pr-check.yml` | CI Mac, Swift tests |
| release.yml | `~/Development/deepterm/.github/workflows/release.yml` | CI Mac, signed DMG |
