# DeepTerm — Development Lifecycle

> **The single end-to-end reference** for how work flows from user-submitted ideas and bugs through AI-assisted triage, planning, multi-agent deliberation, autonomous implementation, CI testing, code review, deployment, and release.

**Last Updated:** 2026-03-18

---

## Overview

DeepTerm uses an AI-augmented development lifecycle that automates most stages while keeping humans in the loop at critical gates. The pipeline spans four machines:

| Machine | Role | IP |
|---------|------|----|
| **Raspberry Pi 5** (rp5m3) | Web app, API, admin cockpit, lifecycle controller | `10.10.10.10` |
| **AI Dev Mac** | Airflow orchestration, AI agent execution, code generation | `192.168.20.222` |
| **CI Mac** | GitHub Actions self-hosted runner, build/test/notarize | `192.168.20.198` |
| **Node-RED** | Webhook routing, WhatsApp notifications | `192.168.1.30` |

```
Idea/Bug ──► Triage ──► Plan ──► Deliberation ──► Implement ──► Test ──► Review ──► Deploy ──► Release
   ▲                                   ▲              │           │         │
   │                                   │              ▼           ▼         │
   │                                   └──── loop-back from test ─┘         │
   │                                   └──── loop-back from review ─────────┘
   │
  User submits via Dashboard
```

---

## 1. Intake — Ideas & Bug Reports

Users submit ideas and bug reports through the web dashboard. Both go through the same intake pipeline.

### 1a. Bug Reports (Issues)

**User action:** Dashboard → Report Issue → fills out title, description, area, optional attachments.

**API:** `POST /api/issues/` creates an `Issue` record and fires off:

```typescript
// fire-and-forget — never blocks the user
triageIssue(issue.id);
```

**Data model:** `Issue` (title, description, area, status, userId) → `IssueUpdate` (comments from AI and human replies).

### 1b. Feature Ideas

**User action:** Dashboard → Ideas → Submit Idea → fills out title, description, category.

**API:** `POST /api/ideas/` creates an `Idea` record and fires off:

```typescript
triageIdea(idea.id);
```

**Data model:** `Idea` (title, description, category, status, authorId) → `IdeaComment` (comments from AI and human replies) → `Vote` (community votes).

### Source Files

| File | Purpose |
|------|---------|
| `src/app/api/issues/route.ts` | Issue creation API |
| `src/app/api/ideas/route.ts` | Idea creation API |
| `src/app/dashboard/issues/` | User issue dashboard |
| `src/app/dashboard/ideas/` | User idea dashboard |

---

## 2. AI Auto-Triage

Immediately after submission, the AI triage system reviews the idea or bug report. This is fully automatic — no human trigger needed.

### How It Works

1. **AI reviews the submission** using the `triage.review` activity (Claude Sonnet).
2. **If information is missing:** AI posts clarifying questions as a comment. User is notified by email and in-app notification.
3. **When user replies:** `continueIssueTriage()` / `continueIdeaTriage()` resumes the conversation with all prior context.
4. **When AI deems info sufficient:** It posts a final structured summary starting with `[TRIAGE_COMPLETE]`.

### Triage Output — Issues

```
[TRIAGE_COMPLETE]
**Title:** Clear, concise title
**Category:** SSH Remote Connection | SFTP | Vault | AI Assistant | General | Other
**Priority:** low | medium | high | urgent
**Summary:** 2-3 sentence summary
**Steps to Reproduce:** Numbered steps
**Expected Behavior:** What should happen
**Actual Behavior:** What actually happens
```

### Triage Output — Ideas

```
[TRIAGE_COMPLETE]
**Title:** Feature title
**Category:** feature | improvement | integration
**Impact:** few | some | many | all
**Summary:** Feature summary
**User Story:** As a [user], I want [feature] so that [benefit]
**Acceptance Criteria:** Bullet list
```

### Notification Flow

- **Email:** `sendIssueReplyEmail()` / `sendIdeaReplyEmail()` via Nodemailer.
- **In-app:** Creates notification record linked to the issue/idea.
- **Silent on failure:** Email/notification failures are logged but never block the main flow.

### Source Files

| File | Purpose |
|------|---------|
| `src/lib/ai-triage.ts` | `triageIssue()`, `triageIdea()`, `continueIssueTriage()`, `continueIdeaTriage()` |
| `src/lib/email.ts` | Email notification helpers |

---

## 3. Idea Evaluation & GitHub Issue Conversion

When an idea is approved by the admin (via the admin feedback panel), it can be converted into a GitHub issue with a detailed implementation spec.

### How It Works

1. **Admin clicks "Evaluate & Convert"** on an approved idea in the admin panel.
2. **API call:** `POST /api/admin/cockpit/ideas/evaluate/` → calls `evaluateAndConvertIdea()`.
3. **AI evaluates** the idea against the full repository context (`getRepoContext()` — file tree, CLAUDE.md, schema) using the `ideas.evaluate` activity.
4. **AI generates** a structured GitHub issue spec:
   - Title, feasibility (high/medium/low), effort (small/medium/large/epic)
   - Labels (auto-assigned)
   - Full markdown body: Summary, Motivation, Proposed Implementation (with actual file paths), Acceptance Criteria, Technical Notes
5. **Duplicate detection:** Searches open GitHub issues for similar titles before creating.
6. **Creates GitHub issue** via the GitHub API.
7. **Links back:** Updates `Idea.githubIssueNumber` in the database.

### Source Files

| File | Purpose |
|------|---------|
| `src/lib/idea-evaluate.ts` | `evaluateAndConvertIdea()` — AI evaluation + GitHub issue creation |
| `src/lib/repo-context.ts` | `getRepoContext()` — builds codebase context for AI (cached) |
| `src/app/api/admin/cockpit/ideas/evaluate/route.ts` | API route wrapping the evaluation function |
| `src/app/admin/feedback/[id]/page.tsx` | Admin UI for idea review + evaluate button |

---

## 4. Epic & Story Planning

Work is organized into **Epics** (groups of related stories) and **Stories** (implementable units). Planning happens in the admin Cockpit → Planning tab.

### 4a. Manual Planning

Admins create and manage epics/stories directly:

- **Create Epic:** `POST /api/admin/cockpit/planning/epics/` — title, description, priority, release type (minor/major).
- **Create Story:** `POST /api/admin/cockpit/planning/stories/` — title, description, priority, linked GitHub issue number, epic assignment, scope, lifecycle template.
- **Reorder:** `POST /api/admin/cockpit/planning/reorder/` — drag-and-drop reordering.

### 4b. AI-Assisted Planning

**AI Propose Epics:** `POST /api/admin/cockpit/planning/ai-propose/`

The AI (`planning.propose` activity, Claude Opus) analyzes:
- Open GitHub issues backlog
- Triage queue items
- Existing epics/stories (to avoid duplicates)
- Repository context

And proposes new epics with grouped stories (2-5 stories per epic), each linked to specific GitHub issues.

**AI Enhance Issue:** `POST /api/admin/cockpit/planning/ai-enhance/`

The AI (`planning.enhance` activity, Claude Sonnet) takes a GitHub issue title + body and:
- Adds structured sections (Steps to Reproduce, Acceptance Criteria, etc.)
- References specific codebase files and patterns
- Keeps the original intent while making it more actionable

### 4c. Story Configuration

Each story has fields that control how it flows through the lifecycle:

| Field | Values | Purpose |
|-------|--------|---------|
| `scope` | `app`, `web`, `both` | Determines which test suites run in CI |
| `lifecycleTemplate` | `full`, `quick_fix`, `hotfix`, `web_only` | Which lifecycle steps are included |
| `githubIssueNumber` | integer or null | Links to GitHub issue for context |
| `priority` | `critical`, `high`, `medium`, `low` | Affects ordering and urgency |

### 4d. Lifecycle Templates

| Template | Steps Included | Use Case |
|----------|---------------|----------|
| **Full** | triage → plan → deliberation → implement → test → review | Standard feature work |
| **Quick Fix** | triage → implement → test → review | Small bug fixes, no design needed |
| **Hotfix** | implement → test → review | Emergency fixes, skip all gates |
| **Web Only** | triage → plan → implement → test → review | Web-only changes, skip deliberation |

### Source Files

| File | Purpose |
|------|---------|
| `src/app/api/admin/cockpit/planning/epics/route.ts` | Epic CRUD |
| `src/app/api/admin/cockpit/planning/stories/route.ts` | Story CRUD |
| `src/app/api/admin/cockpit/planning/ai-propose/route.ts` | AI epic/story proposal |
| `src/app/api/admin/cockpit/planning/ai-enhance/route.ts` | AI issue description enhancement |
| `src/app/api/admin/cockpit/planning/reorder/route.ts` | Drag-and-drop reordering |

---

## 5. Lifecycle Step Management

The lifecycle controller is the central nervous system of the pipeline. It manages step transitions, feedback loops, recovery actions, and CI integration.

### 5a. Step Sequence

Every story progresses through an ordered sequence of steps:

```
triage → plan → deliberation → implement → test → review → deploy → release
```

Each step is tracked via `Story.lifecycleStep` (current step), `Story.lifecycleStartedAt` (when it began), and `Story.lifecycleHeartbeat` (liveness signal from automated steps).

### 5b. Step Timeouts

| Step | Timeout | Notes |
|------|---------|-------|
| triage | none | Human-gated |
| plan | none | Human-gated |
| deliberation | 300s (5 min) | AI auto-completes |
| implement | 600s (10 min) | AI agent loop |
| test | 1200s (20 min) | CI workflow |
| review | none | Human-gated |
| deploy | 600s (10 min) | Build + notarize |
| release | 120s (2 min) | Release notes + notify |

### 5c. Gate Actions (Human Triggers)

Each step has specific actions that advance, retry, or reject:

**Triage:**
| Action | Effect |
|--------|--------|
| `approve-triage` | Story → `planned`, step → `plan` |
| `reject-triage` | Story → `cancelled` |
| `defer-triage` | Step cleared, stays in backlog |

**Plan:**
| Action | Effect |
|--------|--------|
| `complete-plan` | Step → `deliberation` |

**Deliberation:**
| Action | Effect |
|--------|--------|
| `approve-decision` | Step → `implement`, starts agent loop |
| `skip-deliberation` | Creates a "skipped" deliberation record, step → `implement` |
| `restart-deliberation` | Re-runs the deliberation engine |

**Implement:**
| Action | Effect |
|--------|--------|
| `manual-fix` | Step → `test` (when human did the implementation) |
| `manual-pr` | Logs manual PR creation |

**Test:**
| Action | Effect |
|--------|--------|
| `mark-tests-passed` | Step → `review` |

**Review:**
| Action | Effect |
|--------|--------|
| `merge-pr` | Merges PR via GitHub API, step → `merged`, triggers epic check |
| `approve-pr` | Step → `deploy`, marks as merged |
| `reject-pr` | Logs changes requested, remains at `review` |

**Deploy:**
| Action | Effect |
|--------|--------|
| `deploy-release` / `mark-deployed` | Bumps Xcode version, step → `release` |
| `hold-deploy` | Pauses deploy step |

**Release:**
| Action | Effect |
|--------|--------|
| `mark-released` | Story → `released`, logs release sub-steps (notes, notify, docs) |

### 5d. Recovery Actions

| Action | Effect |
|--------|--------|
| `retry-step` | Restarts current step with fresh heartbeat. For `implement`, spawns a new agent loop. For `test`, re-dispatches CI. |
| `skip-step` | Advances to next step |
| `cancel-step` | Halts current step, cancels running agent loops |
| `reset-to-step` | Rewinds story to any earlier step |
| `reset-all` | Returns story to backlog |
| `force-complete` | Marks story as released (emergency override) |
| `resume-from-checkpoint` | Resumes implement from last saved agent checkpoint |
| `split-task` | Returns to plan for scope reduction (context overflow recovery) |
| `reduce-scope` | Restarts implement with reduced scope instructions |

### 5e. Sequential Protection

Stories within an epic are executed **sequentially**:
- A story can only start if the previous sibling has passed review.
- Only one epic can be `in_progress` at a time.
- Violations return `409 Conflict` with descriptive error codes (`PREV_STORY_NOT_COMPLETE`, `ANOTHER_EPIC_IN_PROGRESS`).

### Source Files

| File | Purpose |
|------|---------|
| `src/app/api/admin/cockpit/lifecycle/route.ts` | All lifecycle step transitions and gate actions (~1076 lines) |
| `src/app/api/admin/cockpit/lifecycle/helpers.ts` | CI dispatch, event logging, ETA tracking, version bumping, stale loop recovery |
| `src/app/api/admin/cockpit/lifecycle/events/route.ts` | Lifecycle event ingestion from CI and agents |

---

## 6. Multi-Agent Deliberation

When a story reaches the deliberation step, multiple AI agents independently analyze the task then debate, vote, and synthesize a winning implementation plan.

### 6a. Deliberation Phases

```
proposing  →  debating (2 rounds)  →  voting  →  decided (synthesis)
```

**Phase 1 — Proposals:** Each agent independently generates an implementation plan given the story context, linked GitHub issue, and full repository context.

**Phase 2 — Debate (2 rounds):** Agents read all proposals and engage in structured debate, challenging each other's approaches and defending their own.

**Phase 3 — Voting:** Each agent casts a vote with reasoning. The proposal with the most votes wins.

**Phase 4 — Synthesis:** A final AI call (`deliberation.synthesis`, Claude Opus) distills the winning proposal and debate insights into a concrete implementation plan.

An additional `deliberation.management-summary` call produces a concise executive summary.

### 6b. Agents

**Implementation deliberations** use three agents:

| Agent | Model | Focus |
|-------|-------|-------|
| **Architect** 🏗️ | Claude Opus | Clean architecture, separation of concerns, extensibility, design patterns |
| **Security Engineer** 🔒 | Claude Opus | Input validation, encryption, least privilege, attack surface |
| **Pragmatist** ⚡ | Claude Sonnet | Simplicity, minimal changes for max impact, shipping quickly |

**Architecture review deliberations** replace the Pragmatist with:

| Agent | Model | Focus |
|-------|-------|-------|
| **Performance Engineer** 🚀 | Claude Sonnet | Response times, memory usage, N+1 queries, caching, Pi constraints |

### 6c. Context Building

Each agent receives:
- Story title, description, status, priority
- Epic context (if assigned to an epic)
- Linked GitHub issue body (full text)
- Custom operator instructions
- Repository context: file tree, CLAUDE.md excerpts, Prisma schema

### 6d. Rate Limit Handling

Agents are called **sequentially** with staggering delays:
- 10s between agent calls within a phase
- 15s between phases

This avoids hitting API rate limits when 3-4 agents each make calls across 4 phases.

### 6e. Database Model

`Deliberation` → `DeliberationProposal` (one per agent) → `DeliberationDebate` (per agent per round) → `DeliberationVote` (one per agent).

The final synthesis is stored in `Deliberation.summary` when status transitions to `decided`.

### Source Files

| File | Purpose |
|------|---------|
| `src/lib/deliberation/engine.ts` | `startDeliberation()`, `advanceDeliberation()`, `runFullDeliberation()` — phase orchestration |
| `src/lib/deliberation/agents.ts` | Agent definitions and system prompts |
| `src/app/api/admin/cockpit/deliberation/route.ts` | API for triggering and managing deliberations |

---

## 7. Agent Loop Implementation

When a story reaches the implement step, an autonomous AI agent loop writes the code.

### 7a. Loop Lifecycle

```
queued → running → (think → act → observe) × N → awaiting_review | completed | failed
```

Each iteration:
1. **Think:** AI reasons about the task, the deliberation synthesis, and accumulated file changes.
2. **Act:** AI produces code changes using structured file blocks (`\`\`\`file:path`, `\`\`\`new:path`, `\`\`\`delete:path`).
3. **Observe:** Engine validates the action, records results, merges file changes.

### 7b. Agent Context

The agent receives:
- Story + epic context
- Deliberation synthesis (the approved implementation plan)
- Repository context (file tree, CLAUDE.md, schema)
- Accumulated file changes from prior iterations
- Feedback context (if this is a loop-back from test/review)

### 7c. File Change Accumulation

File changes are **accumulated across iterations** and merged (later iterations override earlier ones for the same path). This allows the agent to iteratively refine its implementation.

### 7d. GitHub Integration

When the agent loop completes:
1. **Groups files by repo** (web app vs Swift app) using path heuristics.
2. **Commits all files** to a feature branch via the GitHub Contents API.
3. **Opens a Pull Request** with a structured description (story ID, deliberation link, files changed).
4. **Notifies Node-RED** → WhatsApp notification to the operator.

Branch naming: `agent/{storyId}` (truncated to fit Git limits).

### 7e. Build Gate

Before committing, the agent can optionally run a build gate verification:
- Checks for syntax errors, import issues
- If build fails, the agent attempts auto-fix within the same loop

### 7f. Circuit Breaker & Checkpoints

- **Max iterations:** Configurable per loop (default: 10). Prevents infinite loops.
- **Checkpoints:** Iterations can be marked as checkpoints, saving a snapshot of accumulated files and context summary. Used for `resume-from-checkpoint` recovery.
- **Stale loop recovery:** `recoverStaleLoops()` runs fire-and-forget on every lifecycle GET request and detects loops that were killed by PM2 restarts (status = `running` but no heartbeat for >5 minutes).

### Source Files

| File | Purpose |
|------|---------|
| `src/lib/agent-loop/engine.ts` | `createAndRunAgentLoop()` — full loop orchestration |
| `src/lib/github-commit.ts` | `commitFiles()`, `createPullRequest()`, `groupByRepo()` |
| `src/lib/node-red.ts` | `notifyAgentPR()` — WhatsApp/webhook notifications |

---

## 8. CI Testing

When a story reaches the test step, the CI workflow is dispatched to the self-hosted CI Mac runner.

### 8a. CI Dispatch

The lifecycle controller dispatches the GitHub Actions workflow:

```typescript
// POST to GitHub API:
// repos/deblasioluca/deepterm/actions/workflows/pr-check.yml/dispatches
dispatchCIWorkflow(storyId, branchName);
```

This triggers `pr-check.yml` on the CI Mac with the story ID as input.

### 8b. CI Workflow (pr-check.yml)

The workflow runs on the CI Mac (`192.168.20.198`) with label `self-hosted-mac`:

1. **Extracts story metadata** from the PR body.
2. **Emits heartbeat events** to the Pi's lifecycle events API throughout.
3. **Build:** `xcodebuild` clean + build.
4. **Unit Tests:** Swift test suite.
5. **UI Tests:** XCUITest suite.
6. **Per-suite event callbacks:** Each suite start/pass/fail is reported back to the Pi:

```
POST /api/admin/cockpit/lifecycle/events
{
  "storyId": "xxx",
  "stepId": "test",
  "event": "completed" | "failed" | "started",
  "detail": { "suite": "build" | "unit" | "ui", "passed": 42, "total": 42 },
  "actor": "ci"
}
```

### 8c. Test Progress Panel

The Cockpit UI shows real-time per-suite progress:

```
Build ✓  →  Unit ✓ (42/42)  →  UI ⏳ (3/7)  →  E2E ○
```

States: `pending` → `active` → `passed` | `failed`

### 8d. Scope-Based Suites

| Story Scope | Suites Run |
|-------------|------------|
| `app` | Build, Unit, UI |
| `web` | E2E |
| `both` | Build, Unit, UI, E2E |

### 8e. Per-Suite Timeouts

| Suite | Timeout |
|-------|---------|
| Build | 300s |
| Unit | 300s |
| UI | 600s |
| E2E | 300s |

### Source Files

| File | Purpose |
|------|---------|
| `src/app/api/admin/cockpit/lifecycle/helpers.ts` | `dispatchCIWorkflow()`, `getCIRunnerStatus()` |
| `src/app/api/admin/cockpit/lifecycle/events/route.ts` | CI event ingestion |
| `docs/pr-check.yml.template` | GitHub Actions workflow template |

---

## 9. Feedback Loops (Loop-Backs)

The lifecycle supports sending a story backward when tests fail or review identifies problems. This is the key mechanism that enables automated self-correction.

### 9a. Available Loop-Backs

| Action | From → To | Trigger | What Happens |
|--------|-----------|---------|-------------|
| `loop-test-to-implement` | test → implement | Test failure, auto-fix possible | AI agent restarts with test failure context; pushes fix to same PR |
| `loop-test-to-deliberation` | test → deliberation | Test failure, fundamental approach wrong | PR closed; new deliberation starts from scratch |
| `loop-review-to-implement` | review → implement | Review feedback, code changes needed | AI agent restarts with reviewer feedback; pushes fix to same PR |
| `loop-review-to-deliberation` | review → deliberation | Review rejection, re-architecture needed | PR closed + branch optionally deleted; fresh rethink |
| `abandon-implementation` | review → plan | Completely wrong approach | PR closed, branch deleted, story reset to planning |

### 9b. Circuit Breaker

Each story tracks:
- `loopCount` — how many loop-backs have occurred
- `maxLoops` — maximum allowed (default: 5)

When `loopCount >= maxLoops`, further loop-back attempts return `400` with:
```json
{ "error": "Circuit breaker: max loops (5) reached. Human intervention required." }
```

### 9c. Loop-Back Traceability

Every loop-back:
1. **Creates lifecycle events** on both the source and target steps.
2. **Comments on the GitHub PR** with the loop-back reason.
3. **Notifies Node-RED** → WhatsApp message: "🔄 Loop: test → implement (2/5): Test failure..."
4. **Increments** `loopCount` and records `lastLoopFrom` / `lastLoopTo`.

### 9d. Loop-Back Visualization

The Cockpit UI shows:
- SVG loop arrows between steps that have been looped
- Loop counter badge: "(2/5)"
- Loop history in the right panel with timestamps and reasons

---

## 10. Code Review

When tests pass, the story advances to the review step. This is a **human gate**.

### What the Reviewer Sees

- Story card in the Cockpit with PR link
- Deliberation summary (the agreed implementation plan)
- Agent loop iteration history (what the AI did)
- Test results (per-suite pass/fail)

### Review Actions

| Action | Effect |
|--------|--------|
| **Merge PR** | Merges via GitHub API → story advances to `merged` → triggers epic sibling check |
| **Approve PR** | Same as merge but marks directly as deployed |
| **Request Changes → Implement** | Loop-back to implement with review feedback |
| **Back to Deliberation** | Loop-back to deliberation, PR closed |
| **Abandon** | PR closed + branch deleted, story reset to plan |

### Post-Merge Epic Gate

After a PR is merged, the system checks if all sibling stories in the epic are also merged:
- **If pending siblings remain:** Story stays at `merged` step, message: "Waiting for N sibling stories."
- **If all siblings merged:** Epic advances to `deploy` step, deploy gate opens.

---

## 11. Deploy & Release

### 11a. Story-Level Deploy

For standalone stories (no epic): `deploy-release` or `mark-deployed` advances to release.

During deploy:
- **Xcode version bump** via GitHub API if this is the first deploy in the epic (reads `project.pbxproj`, increments `MARKETING_VERSION`, commits).
- Version type: `minor` (patch bump) or `major` (minor bump), configured on the epic.

### 11b. Epic-Level Deploy

When all stories in an epic are merged:

1. **Epic deploy gate opens** — `epicLifecycleStep` → `deploy`.
2. **Operator triggers `epic-deploy`** — version bump (once per epic), epic advances to `release`.
3. **Operator triggers `epic-release`** — marks epic + all stories as `released`, logs release sub-steps.

### 11c. Release Sub-Steps

When a story/epic is released, the system logs three audit events:
- `subStep: notes` — Release notes published
- `subStep: notify` — Stakeholders notified
- `subStep: docs` — Documentation updated

### 11d. Release Pipeline (Airflow)

For full native app releases, the `release_pipeline` Airflow DAG on the AI Dev Mac orchestrates:

```
checkout → build DMG → code sign → notarize → upload to Pi → publish version
```

This is documented in detail in `08-AIRFLOW-ORCHESTRATION.md`.

---

## 12. Airflow DAG Orchestration

Apache Airflow on the AI Dev Mac ties together cross-machine workflows. Key DAGs:

| DAG | Purpose | Machines |
|-----|---------|----------|
| `story_implementation` | deliberate → agent → review → report → done | Pi + AI Dev Mac |
| `nightly_build` | pull → build → test → report | CI Mac |
| `architecture_review` | AI architecture review | AI Dev Mac |
| `release_pipeline` | build → sign → notarize → upload → publish | CI Mac + Pi |
| `health_check` | System health monitoring | All |

The Cockpit Pipelines tab proxies Airflow status through:
- `GET /api/admin/cockpit/pipelines/` — list recent DAG runs
- `POST /api/admin/cockpit/pipelines/trigger/` — trigger a DAG run

Full Airflow documentation: `Documentation/08-AIRFLOW-ORCHESTRATION.md`.

---

## 13. AI Activity Registry & Provider Management

### 13a. Activities

Every AI call in the pipeline goes through `callAI(activityKey, ...)` which routes to the correct model based on the activity registry:

| Activity | Category | Default Model | Purpose |
|----------|----------|---------------|---------|
| `triage.review` | issues | Claude Sonnet | Auto-triage of issues and ideas |
| `ideas.evaluate` | issues | Claude Sonnet | Evaluate ideas against repo context |
| `planning.propose` | planning | Claude Opus | AI-propose epics/stories from backlog |
| `planning.enhance` | planning | Claude Sonnet | Enhance GitHub issue descriptions |
| `deliberation.proposal.architect` | deliberation | Claude Opus | Architect's implementation proposal |
| `deliberation.proposal.security` | deliberation | Claude Opus | Security engineer's proposal |
| `deliberation.proposal.pragmatist` | deliberation | Claude Sonnet | Pragmatist's proposal |
| `deliberation.proposal.performance` | deliberation | Claude Sonnet | Performance engineer's proposal |
| `deliberation.debate` | deliberation | Claude Sonnet | Agent debate responses |
| `deliberation.vote` | deliberation | Claude Sonnet | Agent vote casting |
| `deliberation.synthesis` | deliberation | Claude Opus | Final synthesis of winning proposal |
| `deliberation.management-summary` | deliberation | Claude Sonnet | Executive summary |
| `reports.generate` | reports | Claude Sonnet | Auto-generate implementation reports from PRs |
| `issues.create-from-review` | issues | Claude Sonnet | Extract issues from architecture reviews |
| `agent-loop.iterate` | agent | Claude Sonnet | Agent loop think/act/observe iterations |
| `agent-loop.implement` | agent | Claude Sonnet | Agent loop build-gate fix iterations |
| `agent-loop.summarize` | agent | Claude Sonnet | Context compression for long-running loops |
| `pr.code-review` | ci | Claude Opus | AI code review on pull requests |
| `admin.chat` | agent | Claude Opus | Admin panel AI assistant |

### 13b. Model Routing

The `callAI()` function in `src/lib/ai-client.ts` resolves the model for each activity:

1. Check `AIActivityAssignment` table (DB override per activity)
2. Fall back to activity's `defaultModel`
3. Resolve provider (Anthropic, OpenAI) from `AIProvider` table

### 13c. Cost Tracking

Every AI call logs token usage to `AIUsageLog`:
- `inputTokens`, `outputTokens`, provider, model, activity
- Aggregated in the Cockpit AI tab with daily/weekly/monthly breakdowns

---

## 14. Notifications

### WhatsApp (via Node-RED)

| Event | Webhook Path | Content |
|-------|-------------|---------|
| Agent PR created | `/deepterm/agent-pr` | "🤖 PR #N opened for story: {title}" |
| Loop-back | `/deepterm/lifecycle-loop` | "🔄 Loop: {from} → {to} ({count}/{max}): {reason}" |
| Build result | `/deepterm/build-status` | Build success/failure event with details |
| New issue/idea | `/deepterm/triage` | New submission notification |
| Release | `/deepterm/release` | New release published |
| Security alert | `/deepterm/security` | Security event notification |
| Idea popular | `/deepterm/idea-popular` | Idea reached vote threshold |
| Payment | `/deepterm/payment` | Payment/subscription event |

### GitHub PR Comments

The lifecycle automatically comments on PRs for:
- Loop-back events (with attempt count and reason)
- Abandonment (with reason)
- Re-architecture (PR closed notice)

### Email

- Auto-triage follow-up questions → user email
- Issue/idea reply notifications → user email

---

## 15. Event System

All lifecycle transitions are recorded as `LifecycleEvent` records:

```typescript
{
  storyId: string,
  stepId: 'triage' | 'plan' | 'deliberation' | 'implement' | 'test' | 'review' | 'deploy' | 'release',
  event: 'started' | 'progress' | 'heartbeat' | 'completed' | 'failed' | 'timeout'
        | 'cancelled' | 'skipped' | 'retried' | 'reset' | 'loop-back'
        | 'build-gate-pass' | 'build-gate-fail',
  detail: string | null,  // JSON metadata
  actor: 'system' | 'human' | 'ci' | 'agent',
  createdAt: DateTime,
}
```

Events serve three purposes:
1. **Audit trail** — complete history of every lifecycle transition
2. **UI state derivation** — test progress, loop history, and status are parsed from events
3. **ETA estimation** — step durations are recorded in `StepDurationHistory` and used to compute p50/p90 ETAs

---

## 16. End-to-End Example: Full Lifecycle

Here is a concrete example of a feature flowing through the entire pipeline:

```
1. User submits idea: "Add clipboard sync between SSH sessions"
     ↓
2. AI auto-triage asks: "Which sessions? Local only or across devices?"
   User replies → AI posts [TRIAGE_COMPLETE] summary
     ↓
3. Admin approves idea → clicks "Evaluate & Convert"
   AI creates GitHub issue #42 with full implementation spec
     ↓
4. Admin creates Epic: "Session Enhancements"
   Creates Story: "Clipboard sync" → links to GH #42, scope=app, template=full
     ↓
5. Triage: Admin approves → step=plan
     ↓
6. Plan: Admin reviews story config, clicks "Complete Plan" → step=deliberation
     ↓
7. Deliberation: 3 agents propose, debate (2 rounds), vote
   Architect wins with clipboard API + sync protocol approach
   Synthesis produces implementation plan → Admin approves → step=implement
     ↓
8. Implement: Agent loop runs 6 iterations, creates 4 files, modifies 2
   Commits to branch agent/clipboard-sync → opens PR #87
   WhatsApp: "🤖 PR #87 opened: Clipboard sync"
     ↓
9. Test: CI dispatched → pr-check.yml runs on CI Mac
   Build ✓ → Unit ✓ (52/52) → UI ✓ (12/12)
   All suites pass → step=review
     ↓
10. Review: Admin reviews PR, approves → merge-pr → PR merged
    Epic check: 1 sibling story pending → "Waiting for 1 sibling story"
      ↓
11. [Sibling story completes → all merged → epic deploy gate opens]
      ↓
12. Deploy: Admin triggers epic-deploy → version bump to 1.2.0 in Xcode
      ↓
13. Release: Admin triggers epic-release → all stories marked released
    Release notes published, stakeholders notified, docs updated
```

---

## 17. API Reference Summary

### Lifecycle Controller

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/admin/cockpit/lifecycle` | Fetch enriched story lifecycle state |
| `POST` | `/api/admin/cockpit/lifecycle` | Execute gate/recovery actions |
| `GET` | `/api/admin/cockpit/lifecycle/events` | Query lifecycle events |
| `POST` | `/api/admin/cockpit/lifecycle/events` | Ingest CI/agent events |

### Planning

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET/POST` | `/api/admin/cockpit/planning/epics` | Epic CRUD |
| `GET/POST` | `/api/admin/cockpit/planning/stories` | Story CRUD |
| `POST` | `/api/admin/cockpit/planning/ai-propose` | AI propose epics from backlog |
| `POST` | `/api/admin/cockpit/planning/ai-enhance` | AI enhance issue description |
| `POST` | `/api/admin/cockpit/planning/reorder` | Reorder epics/stories |

### Deliberation

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET/POST` | `/api/admin/cockpit/deliberation` | Deliberation CRUD + trigger |

### Ideas

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/admin/cockpit/ideas/evaluate` | Evaluate idea → GitHub issue |

---

## 18. Heartbeat & Staleness Detection

Automated steps (deliberation, implement, test) emit heartbeat events periodically. The Cockpit UI monitors these:

- **Warning threshold:** 90 seconds without heartbeat → orange warning banner.
- **Stale detection:** On every lifecycle GET request (fire-and-forget), `recoverStaleLoops()` finds agent loops that were running but haven't been updated in 5+ minutes (e.g., killed by PM2 restart) and marks them as failed.

---

## 19. Related Documentation

| Document | Covers |
|----------|--------|
| `07-AI-DEV-SYSTEM.md` | Deep dive into deliberation engine, agent loop, reports, AI providers, cost tracking |
| `08-AIRFLOW-ORCHESTRATION.md` | Airflow DAGs, cross-machine orchestration, proxy API |
| `09-ADMIN-AI-ASSISTANT.md` | Admin AI chat panel, tools, operational commands |
| `LIFECYCLE-V2-PLAN.md` | Original task tracking for lifecycle V2 implementation |
| `MASTER-PLAN.md` | Workstream tracking across all project areas |
| `docs/lifecycle-e2e-test.md` | E2E test procedures for all lifecycle paths |
| `docs/pr-check.yml.template` | CI workflow template for the Swift repo |
