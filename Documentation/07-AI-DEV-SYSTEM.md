# AI Dev System Reference

This document covers the AI-powered development automation system built into the DeepTerm admin cockpit. The system comprises four interconnected subsystems: multi-LLM deliberation, implementation reports, autonomous agent loops, and AI cost tracking. It also describes the Airflow orchestration layer that ties them together across the multi-machine infrastructure.

---

## System Overview

The system connects three phases of story implementation with a fourth cross-cutting concern:

```
Story moves to "in_progress"
         │
         ▼
┌─ Deliberation ──────────────────┐
│ 3 agents propose → debate       │
│ vote → synthesize plan          │
└────────────┬────────────────────┘
             │ decided plan
             ▼
┌─ Agent Loop ────────────────────┐
│ Single agent executes the plan  │
│ iterate: code → build → test    │
│ → fix → commit → PR             │
│ Runs on: AI Dev Mac             │
└────────────┬────────────────────┘
             │ PR merged
             ▼
┌─ Implementation Report ─────────┐
│ Auto-generated from PR diff     │
│ Tests, docs, help pages tracked │
└─────────────────────────────────┘

             + AI Usage logging threads through all three phases
```

**Infrastructure context:** The Raspberry Pi (10.10.10.10) runs the web app and orchestration. The AI Dev Mac (192.168.1.249) executes code via agent loops and hosts Apache Airflow. The CI Mac runs builds and tests.

---

## Part 1: Multi-LLM Deliberation

### Purpose

Before any code is written, three AI agents with different personas independently propose implementation plans, debate each other's approaches, vote on the best proposal, and synthesize a final implementation spec. This replaces single-shot AI prompting with structured adversarial review.

### Agent Definitions

Agents are defined in `src/lib/ai-agents.ts`. Each agent references an activity key (not a hardcoded model), so the assigned model is configurable at runtime via the AI settings UI.

**Implementation agents** (used for `type: "implementation"`):

| Agent | Activity Key | Default Model | Focus |
|-------|-------------|---------------|-------|
| Architect | `deliberation.proposal.architect` | `claude-opus-4-6` | Clean architecture, separation of concerns, extensibility, design patterns |
| Security Engineer | `deliberation.proposal.security` | `claude-opus-4-6` | Input validation, encryption, least privilege, attack surface |
| Pragmatist | `deliberation.proposal.pragmatist` | `claude-sonnet-4-6` | Simplicity, minimal changes, testability, shipping velocity |

**Architecture review agents** (used for `type: "architecture_review"`, replaces Pragmatist with Performance Engineer):

| Agent | Activity Key | Default Model | Focus |
|-------|-------------|---------------|-------|
| Architect | `deliberation.proposal.architect` | `claude-opus-4-6` | Structural clarity |
| Security Engineer | `deliberation.proposal.security` | `claude-opus-4-6` | Threat vectors |
| Performance Engineer | `deliberation.proposal.performance` | `claude-sonnet-4-6` | N+1 queries, memory, hot paths |

### Deliberation Flow

**Step 1 — Proposing** (parallel, ~30 seconds)

All three agents receive the story description plus codebase context simultaneously. Each returns a full implementation plan with approach, files to change, new files, data model changes, test strategy, risks, and effort estimate. Proposals are stored in `DeliberationProposal`. Status transitions: `proposing`.

**Step 2 — Debating** (2 rounds, sequential, ~60 seconds)

- Round 1: Each agent reads all proposals and responds with critiques and agreements.
- Round 2: Each agent gives final thoughts after reading Round 1 debate.

Debate entries are stored in `DeliberationDebate`. Status transitions: `proposing → debating`.

**Step 3 — Voting** (~15 seconds)

Each agent votes for the best proposal (agents cannot vote for their own). Each vote includes reasoning. Votes are stored in `DeliberationVote`. Status transitions: `debating → voting`.

**Step 4 — Synthesis** (~15 seconds)

A final call using `deliberation.synthesis` (default: `claude-opus-4-6`) synthesizes the winning proposal plus debate insights into a concrete implementation spec. The result is stored in `Deliberation.summary`. Status transitions: `voting → decided`.

An optional `deliberation.management-summary` call (default: `claude-sonnet-4-6`) generates a concise executive summary from the synthesis.

### Trigger

Deliberation is either:
- Started automatically when a story status changes to `in_progress`
- Manually via the "Start Deliberation" button on the story card in the Planning tab

### Database Schema

```prisma
/// A deliberation session attached to a Story or Epic.
/// Tracks the full lifecycle: proposals → debate → vote → decision.
model Deliberation {
  id            String   @id @default(cuid())
  type          String   // "implementation" | "architecture_review"
  status        String   @default("proposing") // proposing | debating | voting | decided | implementing
  storyId       String?
  epicId        String?
  instructions  String   @default("")  // Custom instructions or architecture review scope
  summary       String   @default("")  // Final decided implementation plan
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  story      Story?   @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic       Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  proposals  DeliberationProposal[]
  debates    DeliberationDebate[]
  votes      DeliberationVote[]
  agentLoops AgentLoop[]

  @@index([storyId])
  @@index([epicId])
  @@index([type])
  @@index([status])
}

/// One agent's proposal within a deliberation.
model DeliberationProposal {
  id             String   @id @default(cuid())
  deliberationId String
  agentName      String   // "Architect", "Security Engineer", "Pragmatist"
  agentModel     String   // actual model used
  content        String   // Full proposal markdown
  strengths      String   @default("")
  risks          String   @default("")
  effort         String   @default("")
  createdAt      DateTime @default(now())

  deliberation   Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)

  @@index([deliberationId])
}

/// A debate round — one agent responds to others' proposals.
model DeliberationDebate {
  id                    String   @id @default(cuid())
  deliberationId        String
  round                 Int      // 1 or 2
  agentName             String
  agentModel            String
  content               String
  referencesProposalIds String   @default("") // Comma-separated proposal IDs
  createdAt             DateTime @default(now())

  deliberation   Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)

  @@index([deliberationId])
  @@index([round])
}

/// Agent votes after debate concludes.
model DeliberationVote {
  id              String   @id @default(cuid())
  deliberationId  String
  agentName       String
  agentModel      String
  votedProposalId String
  reasoning       String
  createdAt       DateTime @default(now())

  deliberation   Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)

  @@index([deliberationId])
}
```

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/admin/cockpit/deliberation/start` | Create a deliberation and kick off parallel proposals |
| `GET` | `/api/admin/cockpit/deliberation/[id]` | Fetch full deliberation with proposals, debates, votes |
| `POST` | `/api/admin/cockpit/deliberation/[id]/advance` | Advance to next phase (proposing→debating→voting→decided) |
| `POST` | `/api/admin/cockpit/deliberation/[id]/auto` | Auto-run all remaining phases to completion |
| `GET` | `/api/admin/cockpit/deliberation/[id]/stream` | SSE stream of real-time agent progress |
| `POST` | `/api/admin/cockpit/deliberation/[id]/create-issues` | Extract findings into GitHub issues (architecture review only) |

**Start request body:**
```typescript
{
  storyId?: string;
  epicId?: string;
  type: "implementation" | "architecture_review";
  instructions?: string;  // Optional scope or architecture_review.md content
}
```

**Stream events:**
```typescript
{ step: string; agentName: string; status: "thinking" | "complete"; content?: string }
```

### Architecture Reviews

Architecture reviews use the same deliberation engine with `type: "architecture_review"`. They are triggered manually from a dialog in the cockpit that accepts:
- Scope: full codebase, specific epic, or custom instructions
- Optional file upload for detailed review specifications

After the `decided` phase, findings are automatically extracted and turned into GitHub issues:

- Title format: `[Arch Review] <finding title>`
- Labels: `architecture`, `ai-review`, `severity:critical|high|medium|low`
- Repo targeting: `deblasioluca/deepterm-web` for web-labeled findings, `deblasioluca/deepterm` for all others

The finding extraction uses the `issues.create-from-review` activity (default: `claude-sonnet-4-6`) to parse the synthesis into a JSON array of `{ title, body, severity, labels }`.

The cockpit has a dedicated "Reviews" tab listing all past architecture reviews with finding count badges (critical, high, medium, low).

---

## Part 2: Implementation Reports

### Purpose

Every story/epic automatically gets an `ImplementationReport` tracking what was actually implemented: which tests were added, which documentation was updated, which help pages were touched, and which files changed.

### How Reports Are Populated

**Option 1 — PR-based (primary method)**

When a PR is merged that references a story (via `Closes #ISSUE` or story label):
1. GitHub webhook fires → Pi receives it
2. PR diff is analyzed and files are categorized:
   - Test files: path contains `Test` — goes into `testsAdded` or `testsUpdated`
   - Doc files: path contains `Documentation/` or ends with `.md` — goes into `docsUpdated`
   - Help pages: path contains `help/`, `docs/`, or `content/` — goes into `helpPagesUpdated`
   - All files → `filesChanged`
3. The `reports.generate` activity (default: `claude-sonnet-4-6`) summarizes all changes

**Option 2 — Manual via "Generate Report" button**

Fetches all PRs linked to the story's GitHub issue number, downloads diffs, runs AI analysis, and populates the report. Humans can review and edit the result.

### Database Schema

```prisma
/// Implementation report attached to a Story or Epic.
model ImplementationReport {
  id               String   @id @default(cuid())
  storyId          String?  @unique
  epicId           String?  @unique
  status           String   @default("pending") // pending | in_progress | complete
  testsAdded       String   @default("[]")  // JSON array of test file paths
  testsUpdated     String   @default("[]")  // JSON array of test file paths
  docsUpdated      String   @default("[]")  // JSON array of doc file paths
  helpPagesUpdated String   @default("[]")  // JSON array of help page paths
  filesChanged     String   @default("[]")  // JSON array of { path, status }
  prNumbers        String   @default("[]")  // JSON array of PR numbers
  summary          String   @default("")    // AI-generated summary
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  story   Story?   @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic    Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)

  @@index([storyId])
  @@index([epicId])
}
```

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/admin/cockpit/reports/generate` | Fetch linked PRs, analyze diffs, generate report |
| `GET` | `/api/admin/cockpit/reports/[id]` | Fetch full report |
| `PATCH` | `/api/admin/cockpit/reports/[id]` | Manual edits to report fields |

**Generate request body:**
```typescript
{ storyId?: string; epicId?: string }
```

---

## Part 3: Agent Loops

### Purpose

Agent loops bridge deliberation (deciding what to do) and implementation reports (verifying what was done). An AI agent iteratively writes code, runs builds, fixes errors, and repeats until the task is complete or safety limits are hit. Execution happens on the AI Dev Mac via SSH from the Pi.

### Lifecycle

```
PENDING → RUNNING → [iterating] → AWAITING_REVIEW → COMPLETED
                        │
                        ├── BUILD_FAILED (retries within loop)
                        ├── TEST_FAILED (retries within loop)
                        ├── LIMIT_HIT (stops — max iterations/files/tokens/time)
                        └── ERROR (unexpected failure)
                                            │
                    CANCELLED ◄─────────────┘  (human can cancel anytime)
```

**Setup:** Agent pulls latest code on the AI Dev Mac, creates a feature branch from the target branch, and reads the deliberation plan as instructions.

**Iteration loop:** The agent (using the `agent-loop.iterate` activity, default: `claude-sonnet-4-6`) reads the current state, outputs structured actions, the Pi executes those actions on the AI Dev Mac via SSH, and the loop checks build/test results. Repeats until `[DONE]` is output or limits are exceeded.

**Finalization:** On completion or limit-hit, the agent commits, pushes the branch, and creates a PR. Status moves to `awaiting_review`. A WhatsApp notification is sent.

**Auto-advance:** When an agent loop completes successfully with a PR number, the lifecycle automatically advances the story from `implement` to `test`. Two lifecycle events are emitted (`implement.completed` and `test.started`), and the story's `lifecycleStep` is updated to `test`. This triggers CI workflow dispatch if configured. If auto-advance fails, the error is logged but the agent loop status is unaffected.

**Human review:** The PR is reviewed in GitHub or the cockpit. The `merge-pr` gate action calls `mergePR()` via the GitHub API and advances the story to the deploy step. Request changes → triggers `loop-review-to-implement` (AI revises with feedback) or `loop-review-to-deliberation` (re-architecture). Reject / Abandon → story returns to `planned`.

### Structured Agent Actions

The agent outputs structured action blocks that the Pi parses and executes:

| Action | Purpose |
|--------|---------|
| `FILE_WRITE` | Create or overwrite a file |
| `FILE_EDIT` | Edit specific lines in a file |
| `FILE_READ` | Read a file's contents |
| `SHELL` | Run a shell command (if `allowShellCommands` is true) |
| `BUILD` | Run the configured build command |
| `TEST` | Run the configured test command |
| `DONE` | Signal that implementation is complete |

Safety checks are applied per action: `FILE_WRITE` and `FILE_EDIT` are validated against `allowedPaths` and `forbiddenPaths`. `SHELL` is only allowed if `allowShellCommands` is true, and the command must appear in `allowedCommands`.

### Circuit Breaker Conditions

The loop stops immediately when any of these conditions are met:

- `maxIterations` exceeded
- `maxDurationMins` wall-clock time exceeded
- `maxFilesChanged` total files changed across all iterations
- Agent outputs `[STUCK]` after repeated failures
- Human cancels the loop

### Database Schema

```prisma
/// A single agent loop execution tied to a Story and optional Deliberation.
model AgentLoop {
  id             String    @id @default(cuid())
  deliberationId String?
  storyId        String?
  epicId         String?
  status         String    @default("queued") // queued | running | paused | awaiting_review | completed | failed | cancelled
  configId       String?

  // Execution context
  branch         String?
  targetRepo     String    @default("deblasioluca/deepterm")
  startedAt      DateTime?
  completedAt    DateTime?

  // Results
  iterationCount Int       @default(0)
  filesChanged   String    @default("[]")
  prNumber       Int?
  prUrl          String?
  commitHashes   String    @default("[]")
  finalSummary   String    @default("")
  errorLog       String    @default("")

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  config         AgentLoopConfig? @relation(fields: [configId], references: [id])
  deliberation   Deliberation?    @relation(fields: [deliberationId], references: [id], onDelete: SetNull)
  story          Story?           @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic           Epic?            @relation(fields: [epicId], references: [id], onDelete: SetNull)
  iterations     AgentIteration[]

  @@index([storyId])
  @@index([epicId])
  @@index([status])
}

/// Individual iteration within an agent loop.
model AgentIteration {
  id           String   @id @default(cuid())
  loopId       String
  number       Int      // 1, 2, 3...
  action       String   // "code_change", "build", "test", "fix", "commit"
  description  String
  filesChanged String   @default("[]")
  output       String   @default("")   // Build/test output (truncated)
  success      Boolean  @default(true)
  durationMs   Int      @default(0)
  tokensUsed   Int      @default(0)
  createdAt    DateTime @default(now())

  loop         AgentLoop @relation(fields: [loopId], references: [id], onDelete: Cascade)

  @@index([loopId])
  @@index([number])
}

/// Reusable agent loop configuration preset.
model AgentLoopConfig {
  id             String   @id @default(cuid())
  name           String   @unique        // "default", "careful", "fast", "docs-only", "web-only"
  description    String   @default("")
  isEnabled      Boolean  @default(true)
  isDefault      Boolean  @default(false)

  // Model selection
  provider       String   @default("anthropic")
  model          String   @default("claude-sonnet-4-20250514")

  // Limits
  maxIterations  Int      @default(10)

  // Targeting
  targetRepo     String   @default("deblasioluca/deepterm")
  targetBranch   String   @default("main")

  // Safety
  allowedPaths   String   @default("[]")  // JSON array of glob patterns
  forbiddenPaths String   @default("[]")  // JSON array of glob patterns
  systemPrompt   String   @default("")

  // Behavior
  autoCreatePR   Boolean  @default(true)
  requireTests   Boolean  @default(true)
  requireBuild   Boolean  @default(true)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  loops          AgentLoop[]
}
```

### Built-In Configuration Presets

Five presets are seeded on first migration:

| Name | maxIterations | targetRepo | requireBuild | requireTests | autoCreatePR | Notes |
|------|---------------|------------|--------------|--------------|--------------|-------|
| `default` | 10 | deepterm | true | true | true | Balanced for typical features |
| `careful` | 5 | deepterm | true | true | false | Conservative, manual PR creation |
| `fast` | 20 | deepterm | true | false | true | High autonomy for low-risk tasks |
| `docs-only` | 5 | deepterm | false | false | true | Documentation and content only |
| `web-only` | 10 | deepterm-web | true | true | true | Next.js web app changes |

### API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/cockpit/agent-loop` | List agent loops with optional `?status=` and `?storyId=` filters |
| `POST` | `/api/admin/cockpit/agent-loop` | Create and start a new agent loop |
| `GET` | `/api/admin/cockpit/agent-loop/[id]` | Get loop details and iterations |
| `POST` | `/api/admin/cockpit/agent-loop/[id]` | Send control command (pause/resume/cancel) |
| `GET` | `/api/admin/cockpit/agent-loop/configs` | List all config presets |
| `POST` | `/api/admin/cockpit/agent-loop/configs` | Create a new config preset |
| `PATCH` | `/api/admin/cockpit/agent-loop/configs` | Update a config preset |

**Start request body:**
```typescript
{
  storyId?: string;
  deliberationId?: string;
  configId?: string;      // ID or name — falls back to first enabled config
  maxIterations?: number; // Per-run override
}
```

**Conflict handling:** Returns `409` if a loop is already `queued` or `running` for the same story.

---

## Part 4: Centralized AI Provider Management

### Overview

API keys and model assignments for all AI activities are stored in the database, not in `.env` files. This allows runtime changes without redeployment and gives the model assignment UI in admin settings full control over which provider and model handles each task.

### Supported Providers

| Provider | Slug | Call style | ENV fallback |
|----------|------|-----------|--------------|
| Anthropic | `anthropic` | Native SDK | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | OpenAI-compatible REST | `OPENAI_API_KEY` |
| Google AI | `google` | Gemini REST | `GOOGLE_AI_KEY` |
| Mistral | `mistral` | OpenAI-compatible REST | `MISTRAL_API_KEY` |
| Groq | `groq` | OpenAI-compatible REST | `GROQ_API_KEY` |

### Database Schema

```prisma
/// AI/LLM provider — API keys stored encrypted with SETTINGS_ENCRYPTION_KEY.
model AIProvider {
  id           String    @id @default(cuid())
  name         String    // "Anthropic", "OpenAI", "Google", "Mistral", "Groq"
  slug         String    @unique // "anthropic", "openai", "google", "mistral", "groq"
  encryptedKey String    @default("")
  baseUrl      String?
  isEnabled    Boolean   @default(true)
  isValid      Boolean   @default(false)
  lastValidAt  DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  models       AIModel[]
}

/// An individual model provided by an AI provider.
model AIModel {
  id              String   @id @default(cuid())
  providerId      String
  modelId         String   // "claude-opus-4-6", "gpt-4o", etc.
  displayName     String
  isEnabled       Boolean  @default(true)
  capabilities    String   @default("[]") // JSON: ["chat", "code", "vision", "long_context"]
  maxTokens       Int      @default(4096)
  costPer1kInput  Float?
  costPer1kOutput Float?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  provider             AIProvider             @relation(fields: [providerId], references: [id], onDelete: Cascade)
  assignments          AIActivityAssignment[] @relation("primaryAssignment")
  secondaryAssignments AIActivityAssignment[] @relation("secondaryAssignment")
  tertiaryAssignments  AIActivityAssignment[] @relation("tertiaryAssignment")

  @@unique([providerId, modelId])
  @@index([providerId])
}

/// Maps an AI activity to a primary model (plus optional secondary/tertiary for ensemble).
model AIActivityAssignment {
  id                   String   @id @default(cuid())
  activity             String   @unique  // Key from AI_ACTIVITIES
  modelId              String
  secondaryModelId     String?
  tertiaryModelId      String?
  temperature          Float    @default(0.7)
  maxTokens            Int      @default(4096)
  systemPromptOverride String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt

  model          AIModel  @relation("primaryAssignment",   fields: [modelId],          references: [id], onDelete: Cascade)
  secondaryModel AIModel? @relation("secondaryAssignment", fields: [secondaryModelId],  references: [id], onDelete: SetNull)
  tertiaryModel  AIModel? @relation("tertiaryAssignment",  fields: [tertiaryModelId],   references: [id], onDelete: SetNull)

  @@index([activity])
}
```

### Activity Registry

Defined in `src/lib/ai-activities.ts`. Every AI call in the system uses an activity key:

| Activity Key | Category | Default Model | Purpose |
|-------------|----------|---------------|---------|
| `deliberation.proposal.architect` | deliberation | `claude-opus-4-6` | Architect agent proposals |
| `deliberation.proposal.security` | deliberation | `claude-opus-4-6` | Security agent proposals |
| `deliberation.proposal.pragmatist` | deliberation | `claude-sonnet-4-6` | Pragmatist agent proposals |
| `deliberation.proposal.performance` | deliberation | `claude-sonnet-4-6` | Performance agent proposals (arch review) |
| `deliberation.debate` | deliberation | `claude-sonnet-4-6` | Debate round responses |
| `deliberation.vote` | deliberation | `claude-sonnet-4-6` | Vote casting and reasoning |
| `deliberation.synthesis` | deliberation | `claude-opus-4-6` | Final synthesis into implementation plan |
| `deliberation.management-summary` | deliberation | `claude-sonnet-4-6` | Executive summary of synthesis |
| `planning.propose` | planning | `claude-opus-4-6` | Propose epics/stories from backlog |
| `planning.enhance` | planning | `claude-sonnet-4-6` | Improve story descriptions |
| `reports.generate` | reports | `claude-sonnet-4-6` | Generate implementation report from PR diff |
| `issues.create-from-review` | issues | `claude-sonnet-4-6` | Extract arch review findings into GitHub issues |
| `agent-loop.iterate` | agent | `claude-sonnet-4-6` | Autonomous coding iterations |
| `pr.code-review` | ci | `claude-opus-4-6` | AI code review on PRs |

### Unified AI Client

**File:** `src/lib/ai-client.ts`

The `callAI()` function is the single entry point for all AI calls in the system:

```typescript
export async function callAI(
  activity: string,
  systemPrompt: string,
  messages: AIMessage[],
  overrides?: {
    temperature?: number;
    maxTokens?: number;
    context?: AICallContext;   // deliberationId, agentLoopId, storyId, epicId
  }
): Promise<AIResponse>
```

Resolution order:
1. Check in-process cache (60-second TTL) for a previously resolved config
2. Query `AIActivityAssignment` in the database — use its assigned model and provider
3. Fall back to `ANTHROPIC_API_KEY` environment variable with the activity's default model

After a database assignment change, call `invalidateAICache()` to flush the 60-second cache.

**Rate limit retry:** `callAI()` wraps every provider call with exponential backoff on 429 responses. Retry delays: 5s, 15s, 30s, 60s (up to 4 retries).

**Ensemble mode:** `callAIEnsemble()` calls up to three models (primary, secondary, tertiary) in parallel and returns all responses. If only a primary model is assigned, it behaves identically to `callAI()`. Failed calls are logged but do not block the other models. The ensemble is used by the deliberation system to give different agents genuinely different model implementations.

```typescript
export async function callAIEnsemble(
  activity: string,
  systemPrompt: string,
  messages: AIMessage[],
  overrides?: { temperature?: number; maxTokens?: number; context?: AICallContext }
): Promise<EnsembleResponse[]>

export interface EnsembleResponse {
  role: 'primary' | 'secondary' | 'tertiary';
  response: AIResponse;
}
```

### API Key Storage

API keys are encrypted at rest using AES-256-GCM via `src/lib/ai-encryption.ts`. The encryption key is derived from `SETTINGS_ENCRYPTION_KEY` (falls back to `NEXTAUTH_SECRET`). The stored format is `ivHex:tagHex:ciphertextHex`.

Keys are never returned in plain form via API — they are masked (`sk-ant-•••crX`) in all responses.

### Provider Management API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/cockpit/ai-providers` | List providers (keys masked) |
| `POST` | `/api/admin/cockpit/ai-providers` | Add or update a provider |
| `GET/PATCH/DELETE` | `/api/admin/cockpit/ai-providers/[id]` | Manage a specific provider |
| `POST` | `/api/admin/cockpit/ai-providers/[id]/validate` | Test the API key |
| `GET` | `/api/admin/cockpit/ai-providers/[id]/models` | Fetch available models from provider |
| `GET` | `/api/admin/cockpit/ai-models` | List all models |
| `PATCH` | `/api/admin/cockpit/ai-models/[id]` | Update model settings (cost rates, enabled) |
| `GET/PUT` | `/api/admin/cockpit/ai-assignments` | List or update activity assignments |

---

## Part 5: AI Cost and Usage Tracking

### Overview

Every `callAI()` invocation is automatically logged in the `finally` block, meaning failures are logged alongside successes. No manual instrumentation is required. Costs are estimated using per-model fallback rates when the model's `costPer1kInput` and `costPer1kOutput` are not configured.

### Database Schema

```prisma
/// Every AI API call is logged here.
model AIUsageLog {
  id            String   @id @default(cuid())
  provider      String   // "anthropic", "openai", "google", "mistral", "groq"
  model         String   // full model ID
  activity      String   // activity key from AI_ACTIVITIES
  category      String   // "deliberation", "planning", "reports", "issues", "ci", "agent"

  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  totalTokens   Int      @default(0)
  costCents     Float    @default(0)  // USD cents, fractional

  deliberationId String?
  agentLoopId    String?
  storyId        String?
  epicId         String?

  durationMs     Int      @default(0)
  success        Boolean  @default(true)
  errorMessage   String?

  createdAt      DateTime @default(now())

  @@index([provider])
  @@index([activity])
  @@index([category])
  @@index([createdAt])
  @@index([deliberationId])
  @@index([agentLoopId])
}

/// Daily and monthly aggregates for fast dashboard queries.
model AIUsageAggregate {
  id            String   @id @default(cuid())
  period        String   // "2026-03-03" (daily) or "2026-03" (monthly)
  periodType    String   // "daily" or "monthly"
  provider      String
  model         String
  activity      String
  category      String

  callCount     Int      @default(0)
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  totalTokens   Int      @default(0)
  costCents     Float    @default(0)
  avgDurationMs Int      @default(0)
  errorCount    Int      @default(0)

  @@unique([period, periodType, provider, model, activity])
  @@index([period])
  @@index([periodType])
  @@index([provider])
}
```

### Fallback Cost Rates

Defined in `src/lib/ai-usage.ts`. Applied when a model's `costPer1kInput`/`costPer1kOutput` fields are null. Rates are in USD per 1K tokens:

| Model | Input ($/1K) | Output ($/1K) |
|-------|-------------|--------------|
| `claude-opus-4-6` | 0.015 | 0.075 |
| `claude-sonnet-4-5-20250929` | 0.003 | 0.015 |
| `claude-haiku-4-5-20251001` | 0.0008 | 0.004 |
| `gpt-4o` | 0.005 | 0.015 |
| `gpt-4o-mini` | 0.00015 | 0.0006 |
| `o1` | 0.015 | 0.060 |
| `o3-mini` | 0.0011 | 0.0044 |
| `gemini-2.5-pro` | 0.00125 | 0.005 |
| `gemini-2.5-flash` | 0.000075 | 0.0003 |
| `mistral-large-latest` | 0.002 | 0.006 |
| `llama-3.3-70b-versatile` | 0.00059 | 0.00079 |
| `mixtral-8x7b-32768` | 0.00024 | 0.00024 |

### Aggregate Upsert Pattern

After every call, `logAIUsage()` in `src/lib/ai-usage.ts` writes one `AIUsageLog` row, then upserts two `AIUsageAggregate` rows — one for the current day (`"2026-03-03"`, `periodType: "daily"`) and one for the current month (`"2026-03"`, `periodType: "monthly"`). The unique key is `(period, periodType, provider, model, activity)`.

The `avgDurationMs` field on aggregates is overwritten (not averaged) on each upsert, reflecting the most recent call's latency.

### Usage API Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/admin/cockpit/ai-usage/summary` | Totals by provider, category, activity. Query: `?period=today\|week\|month\|custom&from=&to=` |
| `GET` | `/api/admin/cockpit/ai-usage/timeline` | Time-series for charts. Query: `?period=week\|month&granularity=hourly\|daily` |
| `GET` | `/api/admin/cockpit/ai-usage/details` | Paginated individual call logs. Query: `?activity=&provider=&limit=50&offset=0` |
| `GET` | `/api/admin/cockpit/ai-usage/by-story/[storyId]` | All AI usage for a specific story |

**Summary response shape:**
```typescript
{
  period: { start: string; end: string };
  totals: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costCents: number;
    costDollars: string;
    avgDurationMs: number;
    errorCount: number;
    errorRate: string;
  };
  byProvider: { provider: string; calls: number; totalTokens: number; costDollars: string }[];
  byCategory: { category: string; calls: number; totalTokens: number; costDollars: string }[];
  byActivity: { activity: string; model: string; calls: number; totalTokens: number; costCents: number }[];
  topConsumers: { storyId: string; title: string; calls: number; totalTokens: number; costDollars: string }[];
}
```

### Cockpit AI Usage Tab

The "AI Usage" tab in the cockpit provides:

- **Summary cards:** Total cost, total tokens, API calls, average latency — with month-over-month delta
- **By-provider horizontal bars:** Each provider's cost and percentage share
- **By-category breakdown:** Agent Loops, Deliberation, Reviews, Planning, CI with percentages
- **Daily cost trend:** Area chart of cost per day over the last 30 days (via `recharts`)
- **Top consumers table:** Top stories/epics by spend, linking back to story cards
- **Recent calls table:** Time, activity, model, tokens, cost

Story cards in the Planning tab display an accumulated cost badge (e.g., `$3.40`). Story detail views show a full breakdown by phase (Deliberation vs. Agent Loop) and by individual agent.

---

## Part 6: Airflow Orchestration

### Purpose

Apache Airflow on the AI Dev Mac provides DAG-based orchestration for the cross-machine pipeline: Raspberry Pi → GitHub → CI Mac → AI Dev Mac. It handles retry/timeout logic, scheduling, dependency management, and pipeline monitoring that would otherwise require ad-hoc webhook plumbing.

### Infrastructure

| Role | Machine | Address |
|------|---------|---------|
| Web app and API | Raspberry Pi | 10.10.10.10 |
| Airflow + agent execution | AI Dev Mac | 192.168.1.249 |
| Build and test | CI Mac | configured via `DEEPTERM_CI_MAC_HOST` |
| Notifications | Node-RED | 192.168.1.30:1880 |

Airflow runs in Docker Compose on the AI Dev Mac. The web UI is at `http://192.168.1.249:8080`. The connection credentials are stored encrypted in `SystemSettings` (`airflow_base_url`, `airflow_username`, `airflow_password`) and configured in the Integrations settings tab.

### DAG Definitions

All DAGs live in `~/airflow/dags/` on the AI Dev Mac. They call the Pi's API (authenticated via `x-api-key`) and SSH into machines via the shared `lib/deepterm_api.py` helper.

**`story_implementation`** — Full story lifecycle (manually triggered):
```
start_deliberation → wait_for_proposals → run_debate → run_vote
  → synthesize_decision → start_agent_loop → wait_for_agent
  → notify_for_review → wait_for_approval → generate_report → mark_done
```
Parameters: `story_id`, `config_name` (default: `default`), `target_repo`

**`nightly_build`** — Runs daily at 02:00:
```
pull_app ──→ build_app ──→ test_app_unit ──┐
                       └──→ test_app_ui   ──┴──→ send_report
pull_web ──→ build_web ────────────────────┘
```
Reports via WhatsApp on completion or failure.

**`architecture_review`** — Manually triggered:
```
start_review → deliberate (all phases) → notify
```
Parameters: `instructions`, `epic_id`

**`release_pipeline`** — Triggered when a tag is pushed via GitHub webhook:
```
checkout_tag → build_dmg → notarize → upload_to_pi → update_website → notify
```
Parameter: `tag`

**`health_check`** — Runs every 6 hours:
```
[check_pi, check_ci_mac, check_node_red, check_docker] → report_health
```
Sends a WhatsApp alert only when issues are detected. Always POSTs results to `/api/internal/health-report`.

### Shared Helper Library

`~/airflow/dags/lib/deepterm_api.py` — key helper functions:

```python
pi_api(method, path, data)         # Authenticated call to Pi's API
ssh_command(host, command)         # SSH execution on any machine
ssh_pi(command)                    # SSH to 10.10.10.10
ssh_ci_mac(command)                # SSH to CI Mac
send_whatsapp(message_type, data)  # Via Node-RED
trigger_deliberation(story_id)
get_deliberation_status(delib_id)
advance_deliberation(delib_id)
trigger_agent_loop(story_id, config_name)
get_agent_loop_status(loop_id)
trigger_report(story_id)
update_story_status(story_id, status)
```

### Airflow Proxy API Routes

The cockpit proxies Airflow's REST API (authenticated via `Basic` auth) to avoid CORS issues and centralise access control:

| Method | Path | Airflow endpoint proxied |
|--------|------|--------------------------|
| `GET` | `/api/admin/cockpit/pipelines/runs` | `GET /api/v1/dags/~/dagRuns` |
| `GET` | `/api/admin/cockpit/pipelines/runs/[dagId]/[runId]` | `GET /api/v1/dags/{dagId}/dagRuns/{runId}/taskInstances` |
| `POST` | `/api/admin/cockpit/pipelines/trigger` | `POST /api/v1/dags/{dagId}/dagRuns` |
| `GET` | `/api/admin/cockpit/pipelines/dags` | `GET /api/v1/dags?only_active=true` |

### Cockpit Pipelines Tab

The "Pipelines" tab shows:

- **Active runs:** Each running DAG with task-level progress indicators and elapsed time
- **Recent runs:** Last 7 days of DAG executions with status and duration
- **Scheduled DAGs:** Upcoming scheduled runs
- **Quick actions:** Buttons to manually trigger each DAG
- **"Open Airflow UI" link:** Direct link to `http://192.168.1.249:8080`

---

## Part 7: Settings — AI and Integrations

### AI and LLM Settings Tab

Located at `src/app/admin/settings/` in the `AISettingsTab.tsx` component. Contains:

**Providers section:** For each provider (Anthropic, OpenAI, Google, Mistral, Groq), shows connection status, masked API key, last validated timestamp, and buttons to edit, validate, and disable. Clicking "Validate" makes a minimal API call (cheapest available model) and updates `isValid` and `lastValidAt`.

**Model Assignments section:** A table mapping every activity to its assigned model. Dropdowns only show models from enabled providers. A "Reset All to Defaults" button restores all assignments to the defaults in `AI_ACTIVITIES`.

**Agent Loop Configurations section:** The config preset manager. Shows all presets in a table with key settings. Supports create, edit, duplicate, and delete. Changes take effect immediately for new loops.

**Usage Budget section (optional):** Monthly spend target with an alert threshold percentage and a hard limit toggle that pauses all AI activity when the budget is exceeded.

### Integrations Settings Tab

The `IntegrationsTab.tsx` component manages all external service connections:

| Integration | Settings |
|-------------|----------|
| GitHub | Token (`ghp_•••`), webhook secret, target repos |
| Node-RED | URL, API key, connection test |
| Airflow | URL, username, password, connection test, link to UI |
| AI Dev Mac | SSH host, connectivity check, last heartbeat |

---

## File Locations

### Web App (Raspberry Pi)

| File | Purpose |
|------|---------|
| `src/lib/ai-activities.ts` | Activity registry — all AI task definitions |
| `src/lib/ai-client.ts` | Unified multi-provider AI client, `callAI()`, `callAIEnsemble()` |
| `src/lib/ai-usage.ts` | Usage logging and cost calculation |
| `src/lib/ai-encryption.ts` | AES-256-GCM encryption for API keys |
| `src/lib/agent-loop/engine.ts` | Agent loop execution engine |
| `src/app/api/admin/cockpit/deliberation/route.ts` | Deliberation list |
| `src/app/api/admin/cockpit/deliberation/[id]/route.ts` | Get deliberation |
| `src/app/api/admin/cockpit/deliberation/[id]/advance/route.ts` | Advance phase |
| `src/app/api/admin/cockpit/deliberation/[id]/auto/route.ts` | Auto-run all phases |
| `src/app/api/admin/cockpit/deliberation/[id]/stream/route.ts` | SSE stream |
| `src/app/api/admin/cockpit/deliberation/[id]/create-issues/route.ts` | GitHub issue creation |
| `src/app/api/admin/cockpit/reports/generate/route.ts` | Generate implementation report |
| `src/app/api/admin/cockpit/reports/[id]/route.ts` | Get/update report |
| `src/app/api/admin/cockpit/agent-loop/route.ts` | List and create agent loops |
| `src/app/api/admin/cockpit/agent-loop/[id]/route.ts` | Get/control agent loop |
| `src/app/api/admin/cockpit/agent-loop/configs/route.ts` | Config preset CRUD |
| `src/app/api/admin/cockpit/ai-providers/route.ts` | Provider management |
| `src/app/api/admin/cockpit/ai-providers/[id]/route.ts` | Provider CRUD |
| `src/app/api/admin/cockpit/ai-providers/[id]/validate/route.ts` | Key validation |
| `src/app/api/admin/cockpit/ai-providers/[id]/models/route.ts` | Fetch provider models |
| `src/app/api/admin/cockpit/ai-models/route.ts` | Model list |
| `src/app/api/admin/cockpit/ai-models/[id]/route.ts` | Model update |
| `src/app/api/admin/cockpit/ai-assignments/route.ts` | Assignment CRUD |
| `src/app/api/admin/cockpit/ai-usage/summary/route.ts` | Usage summary |
| `src/app/api/admin/cockpit/ai-usage/timeline/route.ts` | Usage time-series |
| `src/app/api/admin/cockpit/ai-usage/details/route.ts` | Paginated call logs |
| `src/app/api/admin/cockpit/ai-usage/by-story/[storyId]/route.ts` | Per-story usage |
| `src/app/api/admin/cockpit/pipelines/dags/route.ts` | Airflow DAG list proxy |
| `src/app/api/admin/cockpit/pipelines/runs/route.ts` | Airflow runs proxy |
| `src/app/api/admin/cockpit/pipelines/runs/[dagId]/[runId]/route.ts` | Task instances proxy |
| `src/app/api/admin/cockpit/pipelines/trigger/route.ts` | Trigger DAG proxy |

### AI Dev Mac (Airflow)

| File | Purpose |
|------|---------|
| `~/airflow/dags/lib/__init__.py` | Package init |
| `~/airflow/dags/lib/deepterm_api.py` | Shared helpers (API calls + SSH) |
| `~/airflow/dags/story_implementation.py` | Full story lifecycle DAG |
| `~/airflow/dags/nightly_build.py` | Nightly build and test DAG |
| `~/airflow/dags/architecture_review.py` | Architecture review DAG |
| `~/airflow/dags/release_pipeline.py` | Tag → DMG → notarize → publish DAG |
| `~/airflow/dags/health_check.py` | System health check DAG |
| `~/airflow/.env` | Airflow environment configuration |
| `~/airflow/docker-compose.yaml` | Airflow Docker Compose setup |

---

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Fallback when no DB assignment exists for an Anthropic activity |
| `SETTINGS_ENCRYPTION_KEY` | AES-256-GCM key for encrypting provider API keys in the database |
| `GITHUB_TOKEN` | GitHub API token for PR creation and architecture review issue filing |

All other provider API keys (OpenAI, Google, Mistral, Groq) are stored exclusively in the database via the AI settings UI — not in `.env`.

---

*Last Updated: March 2026*
