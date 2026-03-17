# DeepTerm Web — Improvement Plan

> Living document. Updated as each item is implemented.

## Status Legend
- [ ] Pending
- [x] Completed
- [~] In Progress

---

## Phase 1 — Quick Wins (already merged in PR #2)
- [x] Add `output: 'standalone'` to `next.config.js` (fix Docker build)
- [x] Move hardcoded `ADMIN_EMAIL` to `ADMIN_ALERT_EMAIL` env var
- [x] Restrict CORS origins via `CORS_ALLOWED_ORIGINS` env var
- [x] Add Zod env validation at startup (`src/lib/env.ts`)
- [x] Move plan docs (`MASTER-PLAN.md`, `LIFECYCLE-V2-PLAN.md`, `STRIPE-LIVE-MIGRATION.md`) to `Documentation/`

## Phase 2 — Security
- [ ] Remove `allowDangerousEmailAccountLinking: true` from GitHub and Apple OAuth providers in `src/lib/auth.ts`. Add audit logging when an OAuth account is linked to an existing email.

## Phase 3 — Scalability
- [ ] Migrate intrusion detection sliding-window tracker from in-memory `Map` to Redis (`ioredis` already a dependency). Graceful fallback to in-memory when Redis is unavailable.

## Phase 4 — Developer Experience
- [ ] Fix ESLint configuration: resolve `eslint@8` vs `eslint-config-next@16` (requires `eslint>=9`) peer dependency conflict so `npm run lint` works.

## Phase 5 — Test Reliability
- [ ] Fix flaky/failing E2E lifecycle tests in `e2e/lifecycle.spec.ts`:
  - Test 1: "advance through all 8 gates to release"
  - Test 4: "circuit breaker blocks after maxLoops" (flaky — 400 instead of 200)
  - Test 5: "abandon resets story to planned" (flaky — loopCount 5 instead of 0)
  - Test 6: "lifecycle events endpoint requires API key"

## Phase 6 — Infrastructure
- [ ] Fix Nginx `proxy_cache_path` declaration ordering in `nginx/deepterm.conf` (move above server block for clarity + add explicit cache enable).

## Phase 7 — Code Quality (Large File Refactoring)
- [ ] `src/app/api/admin/cockpit/lifecycle/route.ts` (1,339 lines) — extract helper functions into separate modules
- [ ] Identify and extract other large file candidates if time permits

---

## Out of Scope
- SQLite → PostgreSQL migration (infrastructure decision)
- NextAuth v5 beta → GA upgrade (wait for stable release)
- Security verification items J1-J5 (manual verification by repo owner)
- Full refactoring of all 5 god files (too risky without full test coverage; will extract lifecycle/route.ts helpers as proof-of-concept)
