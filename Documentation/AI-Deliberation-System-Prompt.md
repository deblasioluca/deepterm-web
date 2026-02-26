# DeepTerm AI Deliberation & Review System

## Prompt for Web App Implementation

This document covers three interconnected features for the DeepTerm cockpit:

**A. Multi-LLM Deliberation** — 3 agents propose implementation plans → debate → vote → implement
**B. Implementation Completeness Tracking** — tests, docs, help pages → report per story/epic
**C. Architecture Review System** — 2-3 LLMs review codebase → discuss → conclude → GitHub issues

All features integrate with the existing Planning Tab (epics/stories) in the cockpit.

---

## Current State

### Existing Infrastructure
- **Planning Tab** (`PlanningTab.tsx`): Epics + Stories CRUD, status tracking, drag-and-drop reorder
- **AI Propose** (`/api/admin/cockpit/planning/ai-propose`): Single Claude call to propose epics from GitHub issues
- **AI Enhance** (`/api/admin/cockpit/planning/ai-enhance`): Single Claude call to improve story descriptions
- **Models available**: Anthropic API key configured. Only `claude-opus-4-6` used currently.
- **Database**: Epic + Story models in Prisma/SQLite

### What's Missing
- No multi-agent deliberation
- No implementation tracking beyond status changes
- No architecture review capability
- No debate/discussion persistence
- No report generation

---

## Database Schema Changes

Add these models to `prisma/schema.prisma`:

```prisma
// ============================================
// AI Deliberation System
// ============================================

/// A deliberation session attached to a Story or Epic.
/// Tracks the full lifecycle: proposals → debate → vote → decision.
model Deliberation {
  id            String   @id @default(cuid())
  type          String   // "implementation" | "architecture_review"
  status        String   @default("proposing") // proposing | debating | voting | decided | implementing
  storyId       String?
  epicId        String?
  instructions  String   @default("") // Custom instructions (e.g., architecture_review.md content)
  summary       String   @default("") // Final decision summary
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  story         Story?   @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic          Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  proposals     DeliberationProposal[]
  debates       DeliberationDebate[]
  votes         DeliberationVote[]
  
  @@index([storyId])
  @@index([epicId])
  @@index([type])
  @@index([status])
}

/// One agent's proposal within a deliberation.
model DeliberationProposal {
  id              String   @id @default(cuid())
  deliberationId  String
  agentName       String   // "Architect", "Security Engineer", "Pragmatist"
  agentModel      String   // "claude-opus-4-6", "claude-sonnet-4-5-20250929"
  content         String   // Full proposal markdown
  strengths       String   @default("") // Self-identified strengths
  risks           String   @default("") // Self-identified risks
  effort          String   @default("") // Estimated effort (hours/days)
  createdAt       DateTime @default(now())

  deliberation    Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)
  
  @@index([deliberationId])
}

/// A debate round — one agent responds to others' proposals.
model DeliberationDebate {
  id              String   @id @default(cuid())
  deliberationId  String
  round           Int      // 1, 2, 3...
  agentName       String   // Which agent is speaking
  agentModel      String
  content         String   // Debate response markdown
  referencesProposalIds String @default("") // Comma-separated proposal IDs being discussed
  createdAt       DateTime @default(now())

  deliberation    Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)
  
  @@index([deliberationId])
  @@index([round])
}

/// Agent votes after debate concludes.
model DeliberationVote {
  id              String   @id @default(cuid())
  deliberationId  String
  agentName       String
  agentModel      String
  votedProposalId String   // Which proposal they vote for
  reasoning       String   // Why they voted this way
  createdAt       DateTime @default(now())

  deliberation    Deliberation @relation(fields: [deliberationId], references: [id], onDelete: Cascade)
  
  @@index([deliberationId])
}

/// Implementation report attached to a Story/Epic.
/// Tracks what was actually done during implementation.
model ImplementationReport {
  id              String   @id @default(cuid())
  storyId         String?  @unique
  epicId          String?  @unique
  status          String   @default("pending") // pending | in_progress | complete
  testsAdded      String   @default("[]")  // JSON array of test descriptions
  testsUpdated    String   @default("[]")  // JSON array of test descriptions
  docsUpdated     String   @default("[]")  // JSON array of doc changes
  helpPagesUpdated String  @default("[]")  // JSON array of help page changes
  filesChanged    String   @default("[]")  // JSON array of changed files
  prNumbers       String   @default("[]")  // JSON array of PR numbers
  summary         String   @default("")    // AI-generated summary of all changes
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  story           Story?   @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic            Epic?    @relation(fields: [epicId], references: [id], onDelete: SetNull)
  
  @@index([storyId])
  @@index([epicId])
}
```

Also add relations to existing models:

```prisma
model Epic {
  // ... existing fields ...
  deliberations        Deliberation[]
  implementationReport ImplementationReport?
}

model Story {
  // ... existing fields ...
  deliberations        Deliberation[]
  implementationReport ImplementationReport?
}
```

---

## Feature A: Multi-LLM Deliberation

### Agent Configuration

Three agents with different perspectives. Each uses a different model + persona:

```typescript
// src/lib/ai-agents.ts

export interface AIAgent {
  name: string;
  model: string;
  systemPrompt: string;
  icon: string; // emoji for UI
}

export const DELIBERATION_AGENTS: AIAgent[] = [
  {
    name: 'Architect',
    model: 'claude-opus-4-6',
    icon: '🏗️',
    systemPrompt: `You are a senior software architect reviewing implementation plans for DeepTerm, a professional SSH client.
You prioritize: clean architecture, separation of concerns, extensibility, proper abstractions, design patterns.
You think long-term about maintainability and technical debt.
You favor well-structured code over quick hacks, even if it takes more effort.
When proposing, always consider: data model design, API contracts, error handling strategy, and how the change fits the existing architecture.`,
  },
  {
    name: 'Security Engineer',
    model: 'claude-opus-4-6',
    icon: '🔒',
    systemPrompt: `You are a security-focused engineer reviewing implementation plans for DeepTerm, a professional SSH client that handles sensitive credentials and SSH connections.
You prioritize: input validation, encryption at rest and in transit, least privilege, secure defaults, attack surface minimization.
You always consider: what could go wrong, how could this be exploited, what happens with malformed input, are credentials properly protected.
When proposing, identify threat vectors and ensure mitigations are built-in, not bolted on.`,
  },
  {
    name: 'Pragmatist',
    model: 'claude-sonnet-4-5-20250929',
    icon: '⚡',
    systemPrompt: `You are a pragmatic senior developer focused on shipping quality software efficiently for DeepTerm, a professional SSH client.
You prioritize: simplicity, minimal changes for maximum impact, clear code, testability, user experience.
You push back on over-engineering and unnecessary abstractions.
When proposing, favor the simplest solution that works correctly. Identify what can be deferred vs what must be done now.
You care about: will this actually work, is it testable, can we ship it this week.`,
  },
];

// For architecture reviews, add a fourth perspective:
export const REVIEW_AGENTS: AIAgent[] = [
  DELIBERATION_AGENTS[0], // Architect
  DELIBERATION_AGENTS[1], // Security Engineer
  {
    name: 'Performance Engineer',
    model: 'claude-sonnet-4-5-20250929',
    icon: '🚀',
    systemPrompt: `You are a performance-focused engineer reviewing architecture for DeepTerm, a professional SSH client.
You prioritize: response times, memory usage, efficient data access patterns, caching strategies, lazy loading.
You always consider: what happens at scale (100 connections, 1000 vault items), where are the bottlenecks, what's the memory footprint.
When reviewing, measure twice and cut once. Identify N+1 queries, unnecessary re-renders, expensive operations in hot paths.`,
  },
];
```

### Deliberation Flow

**Trigger**: When a story/epic status changes to `in_progress` (or manually via "Start Deliberation" button)

**Step 1: Propose** (parallel, ~30 seconds)
- All 3 agents receive the story description + codebase context + existing architecture
- Each produces an implementation plan with: approach, files to change, new files, data model changes, test strategy, risks, effort estimate
- All proposals stored in `DeliberationProposal`
- Status: `proposing` → `debating`

**Step 2: Debate** (2 rounds, sequential, ~60 seconds)
- Round 1: Each agent reads ALL proposals and responds with critique + support
  - "I agree with Architect's data model but Security Engineer is right about input validation"
  - "Pragmatist's approach is too simple — it doesn't handle the edge case of..."
- Round 2: Each agent gives final thoughts considering Round 1 feedback
- All debate entries stored in `DeliberationDebate`
- Status: `debating` → `voting`

**Step 3: Vote** (~15 seconds)
- Each agent votes for the best proposal (can't vote for own)
- Must provide reasoning
- Votes stored in `DeliberationVote`
- Status: `voting` → `decided`

**Step 4: Synthesize** (~15 seconds)
- One final Claude call synthesizes the winning proposal + debate insights into a concrete implementation plan
- Stored in `Deliberation.summary`
- This becomes the implementation spec

### API Routes

```
POST /api/admin/cockpit/deliberation/start
  Body: { storyId?, epicId?, type: "implementation" | "architecture_review", instructions?: string }
  → Creates Deliberation, kicks off Step 1
  → Returns: { deliberationId, status: "proposing" }

GET /api/admin/cockpit/deliberation/[id]
  → Returns full deliberation with proposals, debates, votes
  → Used by UI to show progress

POST /api/admin/cockpit/deliberation/[id]/advance
  → Advances to next step (proposing→debating→voting→decided)
  → Each step runs the appropriate AI calls
  → Returns updated deliberation

GET /api/admin/cockpit/deliberation/[id]/stream
  → SSE endpoint for real-time progress updates
  → Emits: { step, agentName, status: "thinking" | "complete", content? }
```

### Implementation Details

```typescript
// src/app/api/admin/cockpit/deliberation/start/route.ts

export async function POST(request: NextRequest) {
  const { storyId, epicId, type, instructions } = await request.json();
  
  // Get story/epic context
  const story = storyId ? await prisma.story.findUnique({ 
    where: { id: storyId },
    include: { epic: true }
  }) : null;
  const epic = epicId ? await prisma.epic.findUnique({
    where: { id: epicId },
    include: { stories: true }
  }) : null;
  
  // Create deliberation
  const deliberation = await prisma.deliberation.create({
    data: {
      type,
      status: 'proposing',
      storyId,
      epicId,
      instructions: instructions || '',
    }
  });
  
  // Get codebase context
  const repoContext = await getRepoContext();
  
  // Build context prompt
  const context = buildDeliberationContext(story, epic, repoContext, instructions);
  
  // Kick off all 3 proposals in parallel
  const agents = type === 'architecture_review' ? REVIEW_AGENTS : DELIBERATION_AGENTS;
  
  const proposalPromises = agents.map(agent => 
    generateProposal(deliberation.id, agent, context, type)
  );
  
  // Don't await — let them run in background
  Promise.all(proposalPromises).then(async () => {
    await prisma.deliberation.update({
      where: { id: deliberation.id },
      data: { status: 'debating' }
    });
  });
  
  return NextResponse.json({ deliberationId: deliberation.id, status: 'proposing' });
}

async function generateProposal(
  deliberationId: string, 
  agent: AIAgent, 
  context: string,
  type: string
) {
  const client = getAnthropic();
  
  const userPrompt = type === 'implementation' 
    ? `Create a detailed implementation plan for the following:\n\n${context}\n\nProvide:\n1. **Approach**: High-level strategy\n2. **Files to modify**: List each file and what changes\n3. **New files**: Any new files needed\n4. **Data model changes**: Schema/model updates\n5. **Test strategy**: What tests to add/update\n6. **Risks**: What could go wrong\n7. **Effort estimate**: Hours or days\n8. **Strengths**: Why this approach is good\n9. **Concerns**: What worries you`
    : `Review the architecture described below and provide your analysis:\n\n${context}\n\nProvide:\n1. **Findings**: Issues, concerns, and observations\n2. **Severity**: Critical / High / Medium / Low for each finding\n3. **Recommendations**: Specific fixes or improvements\n4. **Positive aspects**: What's well-designed\n5. **Summary**: Overall assessment`;
  
  const response = await client.messages.create({
    model: agent.model,
    max_tokens: 4096,
    system: agent.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });
  
  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('\n');
  
  await prisma.deliberationProposal.create({
    data: {
      deliberationId,
      agentName: agent.name,
      agentModel: agent.model,
      content,
    }
  });
}
```

```typescript
// src/app/api/admin/cockpit/deliberation/[id]/advance/route.ts

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const deliberation = await prisma.deliberation.findUnique({
    where: { id: params.id },
    include: { proposals: true, debates: true, votes: true }
  });
  
  if (!deliberation) return errorResponse('Not found', 404);
  
  const agents = deliberation.type === 'architecture_review' ? REVIEW_AGENTS : DELIBERATION_AGENTS;
  
  switch (deliberation.status) {
    case 'proposing':
      // Check all proposals are in
      if (deliberation.proposals.length < agents.length) {
        return NextResponse.json({ status: 'proposing', message: 'Waiting for all proposals' });
      }
      // Move to debating
      await prisma.deliberation.update({ where: { id: params.id }, data: { status: 'debating' } });
      // Start debate round 1
      await runDebateRound(deliberation, agents, 1);
      return NextResponse.json({ status: 'debating', round: 1 });
      
    case 'debating':
      const currentRound = Math.max(...deliberation.debates.map(d => d.round), 0);
      if (currentRound < 2) {
        await runDebateRound(deliberation, agents, currentRound + 1);
        if (currentRound + 1 >= 2) {
          await prisma.deliberation.update({ where: { id: params.id }, data: { status: 'voting' } });
        }
        return NextResponse.json({ status: 'debating', round: currentRound + 1 });
      }
      // Move to voting
      await prisma.deliberation.update({ where: { id: params.id }, data: { status: 'voting' } });
      await runVoting(deliberation, agents);
      return NextResponse.json({ status: 'voting' });
      
    case 'voting':
      // Synthesize final decision
      const summary = await synthesizeDecision(deliberation);
      await prisma.deliberation.update({ 
        where: { id: params.id }, 
        data: { status: 'decided', summary }
      });
      
      // For architecture reviews: create GitHub issues for findings
      if (deliberation.type === 'architecture_review') {
        await createGithubIssuesFromReview(deliberation, summary);
      }
      
      return NextResponse.json({ status: 'decided', summary });
      
    default:
      return NextResponse.json({ status: deliberation.status });
  }
}
```

---

## Feature B: Implementation Completeness Tracking

When a story/epic moves to `in_progress`, an `ImplementationReport` is auto-created. As implementation proceeds (via PRs, commits), the report is populated.

### How It Gets Populated

**Option 1: PR-based (recommended)**
When a PR is merged that references a story (e.g., "Closes #STORY-ID" or tagged with story label):
1. GitHub webhook fires → Pi receives it
2. Pi analyzes the PR diff for:
   - Test files changed → `testsAdded` / `testsUpdated`
   - Documentation files changed → `docsUpdated`
   - Help/content pages changed → `helpPagesUpdated`
   - All files changed → `filesChanged`
   - PR number → `prNumbers`
3. An AI call summarizes the changes into `summary`

**Option 2: Manual + AI assist**
A "Generate Report" button on the story detail view:
1. Fetches all PRs linked to the story (via GitHub issue number)
2. Fetches the diffs
3. AI analyzes and populates the report
4. Human reviews and can edit

### API Routes

```
POST /api/admin/cockpit/reports/generate
  Body: { storyId?, epicId? }
  → Fetches linked PRs from GitHub, analyzes diffs, generates report
  → Returns: ImplementationReport

GET /api/admin/cockpit/reports/[id]
  → Returns full report

PATCH /api/admin/cockpit/reports/[id]
  → Manual edits to report fields
```

### Report Generation Logic

```typescript
// src/app/api/admin/cockpit/reports/generate/route.ts

async function generateReport(storyId?: string, epicId?: string) {
  // Get story with GitHub issue number
  const story = storyId ? await prisma.story.findUnique({ where: { id: storyId } }) : null;
  const epic = epicId ? await prisma.epic.findUnique({ 
    where: { id: epicId },
    include: { stories: true }
  }) : null;
  
  // Collect all GitHub issue numbers
  const issueNumbers: number[] = [];
  if (story?.githubIssueNumber) issueNumbers.push(story.githubIssueNumber);
  if (epic?.stories) {
    epic.stories.forEach(s => { if (s.githubIssueNumber) issueNumbers.push(s.githubIssueNumber); });
  }
  
  // Fetch PRs that reference these issues
  const prs = await fetchLinkedPRs(issueNumbers);
  
  // Fetch diffs for each PR
  const diffs = await Promise.all(prs.map(pr => fetchPRDiff(pr.number)));
  
  // Categorize changed files
  const allFiles = diffs.flat();
  const testsAdded = allFiles.filter(f => f.path.includes('Test') && f.status === 'added');
  const testsUpdated = allFiles.filter(f => f.path.includes('Test') && f.status === 'modified');
  const docsUpdated = allFiles.filter(f => 
    f.path.includes('Documentation/') || f.path.endsWith('.md')
  );
  const helpPages = allFiles.filter(f =>
    f.path.includes('help/') || f.path.includes('docs/') || f.path.includes('content/')
  );
  
  // AI summary
  const client = getAnthropic();
  const summaryResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    system: 'Summarize the implementation changes for a story/epic report. Be concise and specific.',
    messages: [{
      role: 'user',
      content: `Story: ${story?.title || epic?.title}\n\nPRs: ${prs.map(p => `#${p.number}: ${p.title}`).join('\n')}\n\nFiles changed:\n${allFiles.map(f => `${f.status} ${f.path}`).join('\n')}\n\nSummarize what was implemented, what tests were added, and what documentation was updated.`
    }]
  });
  
  const summary = summaryResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('\n');
  
  // Upsert report
  return prisma.implementationReport.upsert({
    where: storyId ? { storyId } : { epicId: epicId! },
    create: {
      storyId,
      epicId,
      status: 'complete',
      testsAdded: JSON.stringify(testsAdded.map(f => f.path)),
      testsUpdated: JSON.stringify(testsUpdated.map(f => f.path)),
      docsUpdated: JSON.stringify(docsUpdated.map(f => f.path)),
      helpPagesUpdated: JSON.stringify(helpPages.map(f => f.path)),
      filesChanged: JSON.stringify(allFiles.map(f => ({ path: f.path, status: f.status }))),
      prNumbers: JSON.stringify(prs.map(p => p.number)),
      summary,
    },
    update: {
      status: 'complete',
      testsAdded: JSON.stringify(testsAdded.map(f => f.path)),
      testsUpdated: JSON.stringify(testsUpdated.map(f => f.path)),
      docsUpdated: JSON.stringify(docsUpdated.map(f => f.path)),
      helpPagesUpdated: JSON.stringify(helpPages.map(f => f.path)),
      filesChanged: JSON.stringify(allFiles.map(f => ({ path: f.path, status: f.status }))),
      prNumbers: JSON.stringify(prs.map(p => p.number)),
      summary,
    }
  });
}
```

### Report Display (in Story/Epic Detail)

```
┌─────────────────────────────────────────────────┐
│ 📋 Implementation Report                        │
│ Status: ✅ Complete                              │
├─────────────────────────────────────────────────┤
│ 🔗 PRs: #42, #45, #47                           │
│                                                  │
│ 📝 Files Changed: 12                             │
│   src/lib/plan-limits.ts (added)                 │
│   src/lib/zk/vault-limits.ts (added)             │
│   src/app/api/zk/vault-items/route.ts (modified) │
│   ... +9 more                                    │
│                                                  │
│ ✅ Tests: 3 added, 2 updated                     │
│   vault-limits.test.ts (added)                   │
│   plan-limits.test.ts (added)                    │
│   ...                                            │
│                                                  │
│ 📖 Docs: 1 updated                               │
│   Documentation/Web-Vault-Alignment-Prompt.md    │
│                                                  │
│ ❓ Help Pages: 0 updated                         │
│   ⚠️ Consider updating: /help/vault, /help/tiers │
│                                                  │
│ 💬 Summary:                                      │
│ Unified tier limits across 3 API endpoints.      │
│ Added server-side vault item limit enforcement.   │
│ Starter plan maxHosts aligned to 3 (was 5).      │
└─────────────────────────────────────────────────┘
```

---

## Feature C: Architecture Review System

### Trigger

New button in cockpit: **"🔍 Architecture Review"** — opens a dialog:

```
┌────────────────────────────────────────────┐
│ 🔍 Start Architecture Review               │
│                                             │
│ Scope:                                      │
│ ○ Full codebase                             │
│ ○ Specific epic: [dropdown]                 │
│ ○ Custom instructions                       │
│                                             │
│ Instructions (optional):                    │
│ ┌─────────────────────────────────────────┐ │
│ │ Review the vault sync architecture.     │ │
│ │ Focus on: error handling, data          │ │
│ │ consistency, offline behavior...        │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Or upload: [📎 architecture_review.md]      │
│                                             │
│ Agents: 🏗️ Architect  🔒 Security  🚀 Perf │
│                                             │
│ [Start Review]                              │
└────────────────────────────────────────────┘
```

### Flow

Same deliberation engine as Feature A, but with `type: "architecture_review"`:

1. **Propose**: Each agent reviews the codebase/scope independently → produces findings
2. **Debate**: Agents discuss each other's findings → agree/disagree/add nuance
3. **Vote**: Agents vote on which findings are most critical
4. **Synthesize**: Final report with prioritized findings
5. **Action**: For each actionable finding → auto-create GitHub Issue with:
   - Title: `[Arch Review] <finding title>`
   - Body: Finding details + agent consensus + recommended fix
   - Labels: `architecture`, `ai-review`, severity label
   - Linked to epic if scoped to one

### GitHub Issue Creation

```typescript
async function createGithubIssuesFromReview(
  deliberation: Deliberation, 
  summary: string
) {
  const ghToken = process.env.GITHUB_TOKEN;
  if (!ghToken) return;
  
  // Parse findings from summary (AI structures them as JSON in the synthesis)
  const client = getAnthropic();
  const parseResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    system: 'Extract actionable findings from this architecture review. Return JSON array of: { title, body, severity: "critical"|"high"|"medium"|"low", labels: string[] }',
    messages: [{ role: 'user', content: summary }],
  });
  
  const text = parseResponse.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('');
  
  let findings: { title: string; body: string; severity: string; labels: string[] }[];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    findings = match ? JSON.parse(match[0]) : [];
  } catch { return; }
  
  // Create issues
  const headers = {
    Authorization: `Bearer ${ghToken}`,
    Accept: 'application/vnd.github+json',
  };
  
  // Use the app repo for architecture issues
  const repos = ['deblasioluca/deepterm', 'deblasioluca/deepterm-web'];
  
  for (const finding of findings) {
    // Determine which repo based on labels or content
    const repo = finding.labels.includes('web') ? repos[1] : repos[0];
    
    const severityLabel = `severity:${finding.severity}`;
    const allLabels = ['architecture', 'ai-review', severityLabel, ...finding.labels]
      .filter(l => !l.startsWith('web'));
    
    await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `[Arch Review] ${finding.title}`,
        body: `## Architecture Review Finding\n\n${finding.body}\n\n---\n*Generated by AI Architecture Review (Deliberation ID: ${deliberation.id})*`,
        labels: allLabels,
      }),
    });
  }
}
```

---

## Cockpit UI Changes

### Planning Tab Enhancements

Add to each Story/Epic card:

```
┌─────────────────────────────────────────────────────────┐
│ 🔒 Vault Tier Alignment                    [in_progress]│
│ Align plan limits across web API endpoints   ⚡ high     │
│                                                          │
│ 🤖 Deliberation: ✅ Decided (3 proposals, 2 rounds)     │
│ 📋 Report: ⚠️ Pending (no PRs linked yet)               │
│                                                          │
│ [▶ View Deliberation] [📋 Generate Report] [✏️ Edit]    │
└─────────────────────────────────────────────────────────┘
```

### New: Deliberation View (slide-out panel or full page)

```
┌───────────────────────────────────────────────────────┐
│ 🤖 Deliberation: Vault Tier Alignment                  │
│ Status: ✅ Decided                                      │
│                                                         │
│ ┌─ Phase 1: Proposals ─────────────────────────────┐   │
│ │                                                    │   │
│ │ 🏗️ Architect           ✅                          │   │
│ │ Create plan-limits.ts as single source of truth.   │   │
│ │ Use dependency injection pattern...                │   │
│ │ [Expand full proposal]                             │   │
│ │                                                    │   │
│ │ 🔒 Security Engineer    ✅                          │   │
│ │ Priority: add server-side enforcement first.       │   │
│ │ Client-side limits are bypassable...               │   │
│ │ [Expand full proposal]                             │   │
│ │                                                    │   │
│ │ ⚡ Pragmatist            ✅                          │   │
│ │ Simple approach: one shared file, update imports.  │   │
│ │ Don't over-engineer the enforcement...             │   │
│ │ [Expand full proposal]                             │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Phase 2: Debate (2 rounds) ─────────────────────┐   │
│ │                                                    │   │
│ │ Round 1:                                           │   │
│ │ 🏗️ "I agree with Security's server-side focus..."  │   │
│ │ 🔒 "Architect's DI pattern is overkill here..."    │   │
│ │ ⚡ "Both make good points. Let's combine..."        │   │
│ │                                                    │   │
│ │ Round 2:                                           │   │
│ │ 🏗️ "Revised: simpler approach with enforcement"    │   │
│ │ 🔒 "Agreed on the combined approach"               │   │
│ │ ⚡ "This is the right balance"                      │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Phase 3: Vote ──────────────────────────────────┐   │
│ │ 🏗️ → Voted for ⚡ Pragmatist (practical approach)  │   │
│ │ 🔒 → Voted for ⚡ Pragmatist (covers security)     │   │
│ │ ⚡ → Voted for 🔒 Security (thorough analysis)     │   │
│ │                                                    │   │
│ │ 🏆 Winner: ⚡ Pragmatist (2 votes)                  │   │
│ └────────────────────────────────────────────────────┘   │
│                                                         │
│ ┌─ Decision ───────────────────────────────────────┐   │
│ │ Create src/lib/plan-limits.ts as single source    │   │
│ │ of truth. Update all 3 tier endpoints to import   │   │
│ │ from it. Add server-side maxVaultItems cap in      │   │
│ │ both single and bulk endpoints. Keep enforcement   │   │
│ │ simple — total count, not per-type (encrypted).    │   │
│ │                                                    │   │
│ │ Files: 8 changes, estimated effort: 2-3 hours     │   │
│ └────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### New: Architecture Review Tab

Add a new tab to the cockpit alongside existing tabs:

```
[Overview] [Triage] [Planning] [Builds] [GitHub] [System Health] [🔍 Reviews]
```

Reviews tab shows:
- List of past architecture reviews with date, scope, status, finding count
- "Start New Review" button
- Click into any review → shows the full deliberation view
- Finding count badges: 🔴 2 critical, 🟡 3 high, 🟢 5 medium

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/ai-agents.ts` | Agent definitions (name, model, persona) |
| `src/app/api/admin/cockpit/deliberation/start/route.ts` | Start deliberation |
| `src/app/api/admin/cockpit/deliberation/[id]/route.ts` | Get deliberation details |
| `src/app/api/admin/cockpit/deliberation/[id]/advance/route.ts` | Advance to next phase |
| `src/app/api/admin/cockpit/reports/generate/route.ts` | Generate implementation report |
| `src/app/api/admin/cockpit/reports/[id]/route.ts` | Get/update report |
| `src/app/admin/cockpit/components/DeliberationView.tsx` | Full deliberation UI |
| `src/app/admin/cockpit/components/ImplementationReport.tsx` | Report display |
| `src/app/admin/cockpit/components/ArchitectureReviewTab.tsx` | Reviews tab |
| `src/app/admin/cockpit/components/ArchitectureReviewDialog.tsx` | Start review dialog |

## Files to Modify

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add Deliberation, DeliberationProposal, DeliberationDebate, DeliberationVote, ImplementationReport models + Epic/Story relations |
| `src/app/admin/cockpit/page.tsx` | Add Reviews tab |
| `src/app/admin/cockpit/components/PlanningTab.tsx` | Add deliberation/report indicators to story/epic cards + action buttons |
| `src/app/admin/cockpit/types.ts` | Add Deliberation and Report types |
| `src/lib/claude.ts` | No changes needed (already provides `getAnthropic()`) |

---

## Implementation Priority

### Phase 1: Core Deliberation Engine (High)
1. Schema migration (add all new models)
2. `ai-agents.ts` agent definitions
3. `deliberation/start` + `deliberation/[id]` + `deliberation/[id]/advance` routes
4. Proposal generation (3 parallel calls)
5. Debate rounds (sequential calls)
6. Voting + synthesis

### Phase 2: Deliberation UI (High)
7. `DeliberationView.tsx` — full panel showing all phases
8. Update `PlanningTab.tsx` — deliberation status on cards + "Start Deliberation" button
9. Real-time progress (polling or SSE)

### Phase 3: Implementation Reports (Medium)
10. `reports/generate` route — PR analysis + AI summary
11. `ImplementationReport.tsx` display component
12. Wire into story/epic detail view
13. "Generate Report" button on story cards

### Phase 4: Architecture Reviews (Medium)
14. `ArchitectureReviewTab.tsx` — list + start dialog
15. `ArchitectureReviewDialog.tsx` — scope selection + instructions
16. GitHub issue creation from findings
17. Review history + finding badges

---

## Environment Variables Needed

```env
# Already exist:
ANTHROPIC_API_KEY=...
GITHUB_TOKEN=...

# Optional — for truly diverse multi-LLM (future):
OPENAI_API_KEY=...     # For GPT-4 as a 4th perspective
GOOGLE_AI_KEY=...      # For Gemini as a 5th perspective
```

For now, the system uses different Anthropic models + personas. This gives genuinely different outputs because Opus reasons differently from Sonnet. Adding OpenAI/Gemini later just means adding new entries to `DELIBERATION_AGENTS` with different API calls.

---

## Testing Checklist

- [ ] Start deliberation for a story → 3 proposals generated
- [ ] Advance to debate → 2 rounds of 3 responses each
- [ ] Advance to vote → 3 votes cast, winner determined
- [ ] Advance to decided → synthesis summary generated
- [ ] Deliberation view shows all phases correctly
- [ ] Story card shows deliberation status badge
- [ ] Generate report for story with linked PRs → report populated
- [ ] Report shows correct file categorization (tests, docs, help)
- [ ] Architecture review: start → 3 findings → debate → decide → GitHub issues created
- [ ] GitHub issues have correct labels and repo targeting
- [ ] Reviews tab lists all past reviews with finding badges

---

*End of Document — AI Deliberation & Review System — 2026-02-26*


---

## Addendum: Centralized AI Provider Management

### Overview

All AI/LLM API keys and model assignments are managed in the web app's admin Settings page — NOT in `.env` files. This allows you to:
- Add/remove API keys for any provider through the UI
- Assign specific models to each AI activity (deliberation agents, code review, proposals, etc.)
- Switch providers without redeployment
- See at a glance which models are used where

### Supported Providers

| Provider | Models | ENV Key (legacy fallback) |
|----------|--------|--------------------------|
| Anthropic | claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001 | ANTHROPIC_API_KEY |
| OpenAI | gpt-4o, gpt-4o-mini, o1, o1-mini, o3-mini | OPENAI_API_KEY |
| Google | gemini-2.5-pro, gemini-2.5-flash | GOOGLE_AI_KEY |
| Mistral | mistral-large-latest, mistral-medium-latest | MISTRAL_API_KEY |
| Groq | llama-3.3-70b-versatile, mixtral-8x7b-32768 | GROQ_API_KEY |

### Database Schema

Add to `prisma/schema.prisma`:

```prisma
/// AI/LLM provider configuration — API keys stored encrypted.
model AIProvider {
  id          String   @id @default(cuid())
  name        String   // "Anthropic", "OpenAI", "Google", "Mistral", "Groq"
  slug        String   @unique // "anthropic", "openai", "google", "mistral", "groq"
  apiKey      String   // Encrypted API key
  baseUrl     String?  // Custom base URL (for proxies or self-hosted)
  isEnabled   Boolean  @default(true)
  isValid     Boolean  @default(false) // Set after successful validation
  lastValidAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  models      AIModel[]
}

/// Available model for a provider. Auto-populated or manually added.
model AIModel {
  id          String   @id @default(cuid())
  providerId  String
  modelId     String   // "claude-opus-4-6", "gpt-4o", etc.
  displayName String   // "Claude Opus 4", "GPT-4o", etc.
  isEnabled   Boolean  @default(true)
  capabilities String  @default("[]") // JSON array: ["chat", "code", "vision", "long_context"]
  maxTokens   Int      @default(4096)
  costPer1kInput  Float? // Optional cost tracking (USD per 1K tokens)
  costPer1kOutput Float?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  provider    AIProvider @relation(fields: [providerId], references: [id], onDelete: Cascade)
  assignments AIActivityAssignment[]

  @@unique([providerId, modelId])
  @@index([providerId])
}

/// Maps an AI activity to a specific model.
model AIActivityAssignment {
  id          String   @id @default(cuid())
  activity    String   @unique // See activity list below
  modelId     String
  temperature Float    @default(0.7)
  maxTokens   Int      @default(4096)
  systemPromptOverride String? // Optional custom system prompt
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  model       AIModel  @relation(fields: [modelId], references: [id], onDelete: Cascade)

  @@index([activity])
}
```

### Activity Registry

Activities are the different AI tasks in the system. Each gets one assigned model:

```typescript
// src/lib/ai-activities.ts

export const AI_ACTIVITIES = {
  // Deliberation agents
  'deliberation.architect': {
    label: 'Deliberation: Architect Agent',
    description: 'Reviews implementation plans with architecture focus',
    defaultModel: 'claude-opus-4-6',
    category: 'deliberation',
  },
  'deliberation.security': {
    label: 'Deliberation: Security Agent',
    description: 'Reviews implementation plans with security focus',
    defaultModel: 'claude-opus-4-6',
    category: 'deliberation',
  },
  'deliberation.pragmatist': {
    label: 'Deliberation: Pragmatist Agent',
    description: 'Reviews implementation plans with shipping focus',
    defaultModel: 'claude-sonnet-4-5-20250929',
    category: 'deliberation',
  },
  'deliberation.synthesizer': {
    label: 'Deliberation: Final Synthesizer',
    description: 'Combines debate results into final decision',
    defaultModel: 'claude-opus-4-6',
    category: 'deliberation',
  },

  // Architecture review agents
  'review.architect': {
    label: 'Arch Review: Architect Agent',
    description: 'Architecture review from structural perspective',
    defaultModel: 'claude-opus-4-6',
    category: 'review',
  },
  'review.security': {
    label: 'Arch Review: Security Agent',
    description: 'Architecture review from security perspective',
    defaultModel: 'claude-opus-4-6',
    category: 'review',
  },
  'review.performance': {
    label: 'Arch Review: Performance Agent',
    description: 'Architecture review from performance perspective',
    defaultModel: 'claude-sonnet-4-5-20250929',
    category: 'review',
  },

  // Existing AI features
  'planning.propose': {
    label: 'Epic/Story Proposal',
    description: 'Proposes new epics and stories from GitHub issues',
    defaultModel: 'claude-opus-4-6',
    category: 'planning',
  },
  'planning.enhance': {
    label: 'Story Enhancement',
    description: 'Improves story descriptions and acceptance criteria',
    defaultModel: 'claude-sonnet-4-5-20250929',
    category: 'planning',
  },
  'report.generate': {
    label: 'Implementation Report',
    description: 'Generates reports from PR diffs',
    defaultModel: 'claude-sonnet-4-5-20250929',
    category: 'reports',
  },
  'review.github_issue': {
    label: 'GitHub Issue Creator',
    description: 'Creates GitHub issues from architecture findings',
    defaultModel: 'claude-sonnet-4-5-20250929',
    category: 'review',
  },
  'pr.code_review': {
    label: 'PR Code Review',
    description: 'AI code review on pull requests (CI pipeline)',
    defaultModel: 'claude-opus-4-6',
    category: 'ci',
  },
} as const;

export type AIActivity = keyof typeof AI_ACTIVITIES;
```

### Unified AI Client

Replace the current `getAnthropic()` with a provider-agnostic client:

```typescript
// src/lib/ai-client.ts

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '@/lib/prisma';
import { AI_ACTIVITIES, AIActivity } from '@/lib/ai-activities';

interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AIResponse {
  content: string;
  model: string;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
}

/**
 * Get the assigned model for an activity.
 * Falls back to default model if no assignment exists.
 */
async function getAssignment(activity: AIActivity) {
  const assignment = await prisma.aIActivityAssignment.findUnique({
    where: { activity },
    include: { model: { include: { provider: true } } },
  });

  if (assignment?.model?.provider?.isEnabled && assignment.model.isEnabled) {
    return {
      provider: assignment.model.provider,
      model: assignment.model,
      temperature: assignment.temperature,
      maxTokens: assignment.maxTokens,
      systemPromptOverride: assignment.systemPromptOverride,
    };
  }

  // Fallback: use default model from activity definition
  const defaultModelId = AI_ACTIVITIES[activity].defaultModel;
  
  // Try to find it in configured providers
  const model = await prisma.aIModel.findFirst({
    where: { modelId: defaultModelId, isEnabled: true },
    include: { provider: true },
  });

  if (model?.provider?.isEnabled) {
    return {
      provider: model.provider,
      model,
      temperature: 0.7,
      maxTokens: 4096,
      systemPromptOverride: null,
    };
  }

  // Last resort: use env variable
  return {
    provider: { slug: 'anthropic', apiKey: process.env.ANTHROPIC_API_KEY || '' },
    model: { modelId: defaultModelId },
    temperature: 0.7,
    maxTokens: 4096,
    systemPromptOverride: null,
  };
}

/**
 * Call an AI model for a specific activity.
 * Automatically routes to the correct provider based on assignment.
 */
export async function callAI(
  activity: AIActivity,
  systemPrompt: string,
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number }
): Promise<AIResponse> {
  const assignment = await getAssignment(activity);
  const provider = assignment.provider;
  const modelId = assignment.model.modelId;
  const temperature = options?.temperature ?? assignment.temperature;
  const maxTokens = options?.maxTokens ?? assignment.maxTokens;
  const finalSystemPrompt = assignment.systemPromptOverride || systemPrompt;

  switch (provider.slug) {
    case 'anthropic':
      return callAnthropic(provider.apiKey, modelId, finalSystemPrompt, messages, temperature, maxTokens);
    case 'openai':
      return callOpenAI(provider.apiKey, modelId, finalSystemPrompt, messages, temperature, maxTokens);
    case 'google':
      return callGoogle(provider.apiKey, modelId, finalSystemPrompt, messages, temperature, maxTokens);
    case 'mistral':
      return callMistral(provider.apiKey, modelId, finalSystemPrompt, messages, temperature, maxTokens);
    case 'groq':
      return callGroq(provider.apiKey, modelId, finalSystemPrompt, messages, temperature, maxTokens);
    default:
      throw new Error(`Unknown provider: ${provider.slug}`);
  }
}

async function callAnthropic(
  apiKey: string, model: string, system: string,
  messages: AIMessage[], temperature: number, maxTokens: number
): Promise<AIResponse> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    temperature,
    system,
    messages: messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  });
  const content = response.content
    .filter(b => b.type === 'text')
    .map(b => b.type === 'text' ? b.text : '')
    .join('\n');
  return {
    content,
    model,
    provider: 'anthropic',
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
  };
}

async function callOpenAI(
  apiKey: string, model: string, system: string,
  messages: AIMessage[], temperature: number, maxTokens: number
): Promise<AIResponse> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        ...messages,
      ],
    }),
  });
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model,
    provider: 'openai',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

async function callGoogle(
  apiKey: string, model: string, system: string,
  messages: AIMessage[], temperature: number, maxTokens: number
): Promise<AIResponse> {
  const lastMessage = messages[messages.length - 1];
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    }
  );
  const data = await response.json();
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
    model,
    provider: 'google',
    inputTokens: data.usageMetadata?.promptTokenCount,
    outputTokens: data.usageMetadata?.candidatesTokenCount,
  };
}

async function callMistral(
  apiKey: string, model: string, system: string,
  messages: AIMessage[], temperature: number, maxTokens: number
): Promise<AIResponse> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model,
    provider: 'mistral',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}

async function callGroq(
  apiKey: string, model: string, system: string,
  messages: AIMessage[], temperature: number, maxTokens: number
): Promise<AIResponse> {
  // Groq uses OpenAI-compatible API
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    model,
    provider: 'groq',
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
  };
}
```

### Update Deliberation Agents

The `ai-agents.ts` agents no longer hardcode models — they reference activities:

```typescript
// src/lib/ai-agents.ts (updated)

import { AIActivity } from '@/lib/ai-activities';

export interface AIAgent {
  name: string;
  activity: AIActivity;        // Maps to model via AIActivityAssignment
  systemPrompt: string;
  icon: string;
}

export const DELIBERATION_AGENTS: AIAgent[] = [
  {
    name: 'Architect',
    activity: 'deliberation.architect',
    icon: '🏗️',
    systemPrompt: `You are a senior software architect...`, // same as before
  },
  {
    name: 'Security Engineer',
    activity: 'deliberation.security',
    icon: '🔒',
    systemPrompt: `You are a security-focused engineer...`,
  },
  {
    name: 'Pragmatist',
    activity: 'deliberation.pragmatist',
    icon: '⚡',
    systemPrompt: `You are a pragmatic senior developer...`,
  },
];

// Deliberation calls become:
// Before: client.messages.create({ model: agent.model, ... })
// After:  callAI(agent.activity, agent.systemPrompt, messages)
```

### Update Existing AI Features

All existing `getAnthropic()` calls should migrate to `callAI()`:

| File | Current | New |
|------|---------|-----|
| `ai-propose/route.ts` | `getAnthropic().messages.create({ model: 'claude-opus-4-6' })` | `callAI('planning.propose', SYSTEM_PROMPT, messages)` |
| `ai-enhance/route.ts` | `getAnthropic().messages.create(...)` | `callAI('planning.enhance', SYSTEM_PROMPT, messages)` |
| Deliberation engine | Direct Anthropic calls | `callAI(agent.activity, agent.systemPrompt, messages)` |
| Report generation | Direct Anthropic calls | `callAI('report.generate', SYSTEM_PROMPT, messages)` |

### Settings UI — AI & LLM Configuration

Add a new section to the existing admin Settings page (`src/app/admin/settings/page.tsx`):

```
┌──────────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                                  │
│                                                               │
│ [General] [Email] [Security] [🤖 AI & LLM]                  │
│                                                               │
│ ┌─ AI Providers ──────────────────────────────────────────┐  │
│ │                                                          │  │
│ │ ┌────────────────────────────────────────────────────┐  │  │
│ │ │ Anthropic                    ✅ Connected           │  │  │
│ │ │ API Key: sk-ant-•••••••••••crX                     │  │  │
│ │ │ Models: Claude Opus 4, Claude Sonnet 4.5           │  │  │
│ │ │ Last validated: 2 hours ago                         │  │  │
│ │ │ [Edit] [Validate] [Disable]                        │  │  │
│ │ └────────────────────────────────────────────────────┘  │  │
│ │                                                          │  │
│ │ ┌────────────────────────────────────────────────────┐  │  │
│ │ │ OpenAI                       ❌ Not configured      │  │  │
│ │ │ API Key: [________________________] [Save]         │  │  │
│ │ └────────────────────────────────────────────────────┘  │  │
│ │                                                          │  │
│ │ ┌────────────────────────────────────────────────────┐  │  │
│ │ │ Google AI                    ❌ Not configured      │  │  │
│ │ │ API Key: [________________________] [Save]         │  │  │
│ │ └────────────────────────────────────────────────────┘  │  │
│ │                                                          │  │
│ │ ┌────────────────────────────────────────────────────┐  │  │
│ │ │ Mistral                      ❌ Not configured      │  │  │
│ │ │ API Key: [________________________] [Save]         │  │  │
│ │ └────────────────────────────────────────────────────┘  │  │
│ │                                                          │  │
│ │ ┌────────────────────────────────────────────────────┐  │  │
│ │ │ Groq                         ❌ Not configured      │  │  │
│ │ │ API Key: [________________________] [Save]         │  │  │
│ │ └────────────────────────────────────────────────────┘  │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─ Model Assignments ─────────────────────────────────────┐  │
│ │                                                          │  │
│ │ Category: [All ▾] [Deliberation] [Review] [Planning]    │  │
│ │                                                          │  │
│ │ ┌──────────────────────────┬───────────────────────┐    │  │
│ │ │ Activity                 │ Assigned Model        │    │  │
│ │ ├──────────────────────────┼───────────────────────┤    │  │
│ │ │ 🏗️ Deliberation: Architect│ [Claude Opus 4    ▾] │    │  │
│ │ │ 🔒 Deliberation: Security │ [Claude Opus 4    ▾] │    │  │
│ │ │ ⚡ Deliberation: Pragmatist│ [GPT-4o           ▾] │    │  │
│ │ │ 📝 Deliberation: Synth.  │ [Claude Opus 4    ▾] │    │  │
│ │ │ 🏗️ Review: Architect      │ [Claude Opus 4    ▾] │    │  │
│ │ │ 🔒 Review: Security       │ [Gemini 2.5 Pro  ▾] │    │  │
│ │ │ 🚀 Review: Performance    │ [Claude Sonnet 4.5▾] │    │  │
│ │ │ 💡 Epic/Story Proposal    │ [Claude Opus 4    ▾] │    │  │
│ │ │ ✨ Story Enhancement      │ [Claude Sonnet 4.5▾] │    │  │
│ │ │ 📋 Implementation Report  │ [Claude Sonnet 4.5▾] │    │  │
│ │ │ 🔍 PR Code Review         │ [Claude Opus 4    ▾] │    │  │
│ │ └──────────────────────────┴───────────────────────┘    │  │
│ │                                                          │  │
│ │ Dropdowns only show models from enabled providers.       │  │
│ │ [Reset All to Defaults]                                  │  │
│ └──────────────────────────────────────────────────────────┘  │
│                                                               │
│ ┌─ Usage & Cost Tracking (Optional) ──────────────────────┐  │
│ │                                                          │  │
│ │ Today:  1,247 input tokens / 3,891 output tokens         │  │
│ │ This month: ~$2.34 estimated cost                        │  │
│ │ [View detailed log]                                      │  │
│ └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### API Routes for AI Settings

```
GET  /api/admin/settings/ai/providers
  → Returns all providers (API keys masked: sk-ant-•••••crX)

POST /api/admin/settings/ai/providers
  Body: { slug, apiKey, baseUrl? }
  → Creates/updates provider, auto-validates key, fetches available models

POST /api/admin/settings/ai/providers/[slug]/validate
  → Tests the API key by making a minimal API call
  → Updates isValid + lastValidAt

PATCH /api/admin/settings/ai/providers/[slug]
  Body: { isEnabled?, apiKey?, baseUrl? }
  → Updates provider settings

GET  /api/admin/settings/ai/assignments
  → Returns all activity assignments with model details

PUT  /api/admin/settings/ai/assignments
  Body: { activity: string, modelId: string, temperature?, maxTokens? }
  → Creates/updates assignment

POST /api/admin/settings/ai/assignments/reset
  → Resets all assignments to defaults from AI_ACTIVITIES
```

### API Key Validation

When a provider API key is saved, auto-validate with a minimal call:

```typescript
async function validateProvider(slug: string, apiKey: string): Promise<boolean> {
  try {
    switch (slug) {
      case 'anthropic': {
        const client = new Anthropic({ apiKey });
        await client.messages.create({
          model: 'claude-haiku-4-5-20251001', // Cheapest model for validation
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        return true;
      }
      case 'openai': {
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
      }
      case 'google': {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );
        return res.ok;
      }
      case 'mistral': {
        const res = await fetch('https://api.mistral.ai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
      }
      case 'groq': {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        });
        return res.ok;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}
```

### API Key Storage Security

API keys in the database should be encrypted at rest. Use a simple approach:

```typescript
// src/lib/crypto.ts (add to existing or create)
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.SETTINGS_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || '';
const ALGORITHM = 'aes-256-gcm';

export function encryptApiKey(plaintext: string): string {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${encrypted}`;
}

export function decryptApiKey(encrypted: string): string {
  const [ivHex, tagHex, ciphertext] = encrypted.split(':');
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32));
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
```

Add to `.env`:
```
SETTINGS_ENCRYPTION_KEY=<random 32+ char string>
```

### Files to Create (Additional)

| File | Purpose |
|------|---------|
| `src/lib/ai-activities.ts` | Activity registry (all AI tasks) |
| `src/lib/ai-client.ts` | Unified multi-provider AI client |
| `src/app/api/admin/settings/ai/providers/route.ts` | Provider CRUD |
| `src/app/api/admin/settings/ai/providers/[slug]/validate/route.ts` | Key validation |
| `src/app/api/admin/settings/ai/providers/[slug]/route.ts` | Provider update |
| `src/app/api/admin/settings/ai/assignments/route.ts` | Assignment CRUD |
| `src/app/api/admin/settings/ai/assignments/reset/route.ts` | Reset to defaults |
| `src/app/admin/settings/components/AISettingsSection.tsx` | Settings UI component |

### Files to Modify (Additional)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add AIProvider, AIModel, AIActivityAssignment models |
| `src/app/admin/settings/page.tsx` | Add AI & LLM tab |
| `src/lib/ai-agents.ts` | Remove hardcoded models, use activity references |
| `src/lib/claude.ts` | Deprecate — replaced by `ai-client.ts` |
| `src/app/api/admin/cockpit/planning/ai-propose/route.ts` | Use `callAI('planning.propose', ...)` |
| `src/app/api/admin/cockpit/planning/ai-enhance/route.ts` | Use `callAI('planning.enhance', ...)` |
| All deliberation routes | Use `callAI(agent.activity, ...)` |

### Migration Strategy

1. Add schema models + run migration
2. Seed providers from existing env vars:
   ```typescript
   // seed script or migration hook
   if (process.env.ANTHROPIC_API_KEY) {
     await prisma.aIProvider.upsert({
       where: { slug: 'anthropic' },
       create: { name: 'Anthropic', slug: 'anthropic', apiKey: encrypt(process.env.ANTHROPIC_API_KEY), isEnabled: true, isValid: true },
       update: {},
     });
     // Seed default models
     for (const model of ['claude-opus-4-6', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5-20251001']) {
       await prisma.aIModel.upsert({ ... });
     }
   }
   ```
3. Seed default assignments from `AI_ACTIVITIES`
4. `callAI()` falls back to env vars if DB is empty — zero breakage
5. Migrate existing routes one by one

---

*End of Addendum — AI Provider Management — 2026-02-26*


---

## Addendum: Agent Loops & Configuration

### Overview

Agent loops bridge the gap between deliberation (deciding what to do) and implementation reports (verifying what was done). A single AI agent iteratively works on a task: write code → build → test → fix errors → repeat until done or limits hit.

```
Story moves to "in_progress"
         │
         ▼
┌─ Deliberation ─────────────────┐
│ 3 agents debate → vote → plan  │
└────────────┬───────────────────┘
             │ decided plan
             ▼
┌─ Agent Loop ───────────────────┐
│ Single agent executes the plan │
│ iterate: code → build → test   │
│ → fix → commit → repeat        │
│ Runs on: AI Dev Mac            │
└────────────┬───────────────────┘
             │ PR created
             ▼
┌─ Implementation Report ────────┐
│ Auto-generated from PR diff    │
│ Tests, docs, help pages        │
└────────────────────────────────┘
```

### Agent Loop Lifecycle

```
PENDING → RUNNING → [iterating] → AWAITING_REVIEW → COMPLETED
                        │                               │
                        ├── BUILD_FAILED (retries)      │
                        ├── TEST_FAILED (retries)       │
                        ├── LIMIT_HIT (stops)           │
                        └── ERROR (stops)               │
                                                        │
                    CANCELLED ◄─── (human can cancel anytime)
```

**Step 1: Setup** (automatic)
- Clone/pull latest code on AI Dev Mac
- Create feature branch from `develop`
- Read deliberation plan as instructions

**Step 2: Iterate** (autonomous)
- Agent reads plan, modifies files
- Runs build → checks for errors → fixes if needed
- Runs tests → checks for failures → fixes if needed
- Each iteration is logged with: action taken, files changed, build/test output
- Repeats until: all tasks done, or max iterations hit, or human checkpoint triggered

**Step 3: Finalize** (semi-autonomous)
- Agent commits changes with descriptive message
- Pushes branch, creates PR
- Moves to AWAITING_REVIEW
- WhatsApp notification: "🤖 Agent completed Story X — PR #42 ready for review"

**Step 4: Human Review**
- You review PR in GitHub or cockpit
- Approve → merge → story moves to `done` → report generated
- Request changes → agent loop can resume with feedback
- Reject → branch deleted, story back to `planned`

### Database Schema

```prisma
/// An agent loop execution attached to a deliberation/story.
model AgentLoop {
  id              String   @id @default(cuid())
  deliberationId  String?
  storyId         String?
  epicId          String?
  status          String   @default("pending") // pending, running, paused, awaiting_review, completed, failed, cancelled
  configId        String   // References AgentLoopConfig
  
  // Execution context
  branch          String?  // Feature branch name
  targetRepo      String   @default("deepterm") // "deepterm" or "deepterm-web"
  startedAt       DateTime?
  completedAt     DateTime?
  
  // Results
  iterationCount  Int      @default(0)
  filesChanged    String   @default("[]") // JSON array
  prNumber        Int?
  prUrl           String?
  commitHashes    String   @default("[]") // JSON array
  finalSummary    String   @default("")
  errorLog        String   @default("")
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  config          AgentLoopConfig @relation(fields: [configId], references: [id])
  deliberation    Deliberation?   @relation(fields: [deliberationId], references: [id], onDelete: SetNull)
  story           Story?          @relation(fields: [storyId], references: [id], onDelete: SetNull)
  epic            Epic?           @relation(fields: [epicId], references: [id], onDelete: SetNull)
  iterations      AgentIteration[]

  @@index([storyId])
  @@index([epicId])
  @@index([status])
}

/// Individual iteration within an agent loop.
model AgentIteration {
  id          String   @id @default(cuid())
  loopId      String
  number      Int      // 1, 2, 3...
  action      String   // "code_change", "build", "test", "fix", "commit"
  description String   // What the agent did
  filesChanged String  @default("[]") // JSON array of files touched this iteration
  output      String   @default("")   // Build/test output (truncated)
  success     Boolean  @default(true)
  durationMs  Int      @default(0)
  tokensUsed  Int      @default(0)
  createdAt   DateTime @default(now())

  loop        AgentLoop @relation(fields: [loopId], references: [id], onDelete: Cascade)

  @@index([loopId])
  @@index([number])
}

/// Reusable agent loop configuration.
/// Multiple presets for different task types.
model AgentLoopConfig {
  id              String   @id @default(cuid())
  name            String   @unique // "default", "careful", "fast", "docs-only"
  description     String   @default("")
  isDefault       Boolean  @default(false)
  
  // Limits
  maxIterations   Int      @default(20)
  maxDurationMins Int      @default(60)     // Max wall-clock time
  maxFilesChanged Int      @default(30)     // Safety cap
  maxTokensBudget Int      @default(500000) // Total token budget
  
  // Behavior
  activity        String   @default("agent.implementer") // AI activity for model selection
  buildCommand    String   @default("xcodebuild build -workspace DeepTerm.xcworkspace -scheme DeepTerm -sdk macosx -arch arm64 2>&1 | tail -20")
  testCommand     String   @default("xcodebuild test -workspace DeepTerm.xcworkspace -scheme DeepTermTests -sdk macosx -arch arm64 2>&1 | tail -30")
  webBuildCommand String   @default("npm run build 2>&1 | tail -15")
  webTestCommand  String   @default("npm test 2>&1 | tail -20")
  
  // Safety
  requireBuildPass    Boolean @default(true)  // Must pass build before commit
  requireTestPass     Boolean @default(false) // Must pass tests before commit (stricter)
  autoCommit          Boolean @default(true)  // Auto-commit on success
  autoCreatePR        Boolean @default(true)  // Auto-create PR on completion
  autoPush            Boolean @default(true)  // Auto-push branch
  
  // Checkpoints — pause and ask human
  pauseBeforeCommit   Boolean @default(false) // Pause for review before committing
  pauseAfterNIterations Int   @default(0)     // 0 = never, 5 = pause every 5 iterations
  pauseOnTestFailure  Boolean @default(true)  // Pause if tests fail after 2 retries
  
  // Restrictions
  allowedPaths    String   @default("[]") // JSON array of glob patterns: ["Sources/**", "Tests/**"]
  forbiddenPaths  String   @default("[]") // JSON array: ["*.p12", "*.env", "Podfile.lock"]
  allowShellCommands Boolean @default(false) // Can the agent run arbitrary shell commands?
  allowedCommands String   @default("[]")   // JSON array: ["xcodebuild", "swift", "git", "npm"]
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  loops           AgentLoop[]
}
```

Add relations to existing models:

```prisma
model Story {
  // ... existing fields ...
  agentLoops  AgentLoop[]
}

model Epic {
  // ... existing fields ...
  agentLoops  AgentLoop[]
}

model Deliberation {
  // ... existing fields ...
  agentLoops  AgentLoop[]
}
```

### Default Configurations (Presets)

Seed these on first migration:

```typescript
const DEFAULT_CONFIGS = [
  {
    name: 'default',
    description: 'Balanced settings for typical feature implementation',
    isDefault: true,
    maxIterations: 20,
    maxDurationMins: 60,
    maxFilesChanged: 30,
    maxTokensBudget: 500000,
    requireBuildPass: true,
    requireTestPass: false,
    autoCommit: true,
    autoCreatePR: true,
    autoPush: true,
    pauseBeforeCommit: false,
    pauseAfterNIterations: 0,
    pauseOnTestFailure: true,
    allowedPaths: JSON.stringify(['Sources/**', 'Tests/**', 'Documentation/**']),
    forbiddenPaths: JSON.stringify(['*.p12', '*.env*', 'Podfile.lock', '.github/**']),
    allowShellCommands: false,
    allowedCommands: JSON.stringify(['xcodebuild', 'swift', 'git', 'pod']),
  },
  {
    name: 'careful',
    description: 'Conservative settings — pauses frequently for human review',
    maxIterations: 10,
    maxDurationMins: 30,
    maxFilesChanged: 10,
    maxTokensBudget: 200000,
    requireBuildPass: true,
    requireTestPass: true,
    autoCommit: false,       // Pause before commit
    autoCreatePR: false,
    autoPush: false,
    pauseBeforeCommit: true,
    pauseAfterNIterations: 3,
    pauseOnTestFailure: true,
    allowedPaths: JSON.stringify(['Sources/**']),
    forbiddenPaths: JSON.stringify(['*.p12', '*.env*', 'Podfile.lock', '.github/**', 'Tests/**']),
    allowShellCommands: false,
    allowedCommands: JSON.stringify(['xcodebuild', 'swift', 'git']),
  },
  {
    name: 'fast',
    description: 'High autonomy for well-defined, low-risk tasks',
    maxIterations: 30,
    maxDurationMins: 90,
    maxFilesChanged: 50,
    maxTokensBudget: 800000,
    requireBuildPass: true,
    requireTestPass: false,
    autoCommit: true,
    autoCreatePR: true,
    autoPush: true,
    pauseBeforeCommit: false,
    pauseAfterNIterations: 0,
    pauseOnTestFailure: false,
    allowedPaths: JSON.stringify(['Sources/**', 'Tests/**', 'Documentation/**', 'src/**']),
    forbiddenPaths: JSON.stringify(['*.p12', '*.env*']),
    allowShellCommands: true,
    allowedCommands: JSON.stringify(['xcodebuild', 'swift', 'git', 'pod', 'npm', 'node', 'python3']),
  },
  {
    name: 'docs-only',
    description: 'Documentation and help page updates only',
    maxIterations: 10,
    maxDurationMins: 20,
    maxFilesChanged: 15,
    maxTokensBudget: 100000,
    requireBuildPass: false,
    requireTestPass: false,
    autoCommit: true,
    autoCreatePR: true,
    autoPush: true,
    pauseBeforeCommit: false,
    pauseAfterNIterations: 0,
    pauseOnTestFailure: false,
    allowedPaths: JSON.stringify(['Documentation/**', 'src/app/**/help/**', 'src/content/**', '*.md']),
    forbiddenPaths: JSON.stringify(['Sources/**', 'Tests/**', '*.swift', '*.ts', '*.tsx']),
    allowShellCommands: false,
    allowedCommands: JSON.stringify(['git']),
  },
  {
    name: 'web-only',
    description: 'Web app changes only (Next.js on Pi)',
    maxIterations: 20,
    maxDurationMins: 45,
    maxFilesChanged: 25,
    maxTokensBudget: 400000,
    activity: 'agent.web_implementer',
    buildCommand: '',
    testCommand: '',
    webBuildCommand: 'cd ~/deepterm && npm run build 2>&1 | tail -15',
    webTestCommand: 'cd ~/deepterm && npm test 2>&1 | tail -20',
    requireBuildPass: true,
    requireTestPass: false,
    autoCommit: true,
    autoCreatePR: true,
    autoPush: true,
    pauseBeforeCommit: false,
    pauseAfterNIterations: 0,
    pauseOnTestFailure: true,
    allowedPaths: JSON.stringify(['src/**', 'prisma/**', 'public/**']),
    forbiddenPaths: JSON.stringify(['*.env*', 'node_modules/**']),
    allowShellCommands: true,
    allowedCommands: JSON.stringify(['npm', 'npx', 'node', 'git', 'prisma']),
  },
];
```

### Add AI Activities for Agent Loops

Add to `src/lib/ai-activities.ts`:

```typescript
// Agent loop activities
'agent.implementer': {
  label: 'Agent: App Implementer',
  description: 'Autonomous coding agent for Swift/macOS app',
  defaultModel: 'claude-opus-4-6',
  category: 'agent',
},
'agent.web_implementer': {
  label: 'Agent: Web Implementer',
  description: 'Autonomous coding agent for Next.js web app',
  defaultModel: 'claude-opus-4-6',
  category: 'agent',
},
'agent.test_writer': {
  label: 'Agent: Test Writer',
  description: 'Writes and updates test cases',
  defaultModel: 'claude-sonnet-4-5-20250929',
  category: 'agent',
},
'agent.doc_writer': {
  label: 'Agent: Documentation Writer',
  description: 'Updates documentation and help pages',
  defaultModel: 'claude-sonnet-4-5-20250929',
  category: 'agent',
},
```

### Agent Loop Execution Engine

The agent loop runs on the **AI Dev Mac** via SSH from the Pi. The Pi orchestrates, the Mac executes.

```typescript
// src/lib/agent-loop-engine.ts

import { prisma } from '@/lib/prisma';
import { callAI } from '@/lib/ai-client';
import { AIActivity } from '@/lib/ai-activities';

interface LoopContext {
  loopId: string;
  plan: string;           // From deliberation decision
  repoPath: string;       // e.g., "~/Development/deepterm"
  branch: string;
  config: AgentLoopConfig;
  sshTarget: string;      // "luca@192.168.1.249" for AI Dev Mac
}

/**
 * Execute a single iteration of the agent loop.
 * Called repeatedly by the orchestrator.
 * Returns whether to continue iterating.
 */
async function executeIteration(ctx: LoopContext, iterationNum: number): Promise<{
  continue: boolean;
  action: string;
  description: string;
  filesChanged: string[];
  output: string;
  success: boolean;
}> {
  // 1. Get current state — read changed files, build output, test output
  const currentState = await getCurrentState(ctx);
  
  // 2. Ask AI what to do next
  const aiResponse = await callAI(
    ctx.config.activity as AIActivity,
    buildAgentSystemPrompt(ctx.config),
    [
      { role: 'user', content: buildIterationPrompt(ctx.plan, currentState, iterationNum) },
    ]
  );
  
  // 3. Parse AI response for actions
  const actions = parseAgentActions(aiResponse.content);
  
  // 4. Execute actions on AI Dev Mac via SSH
  const results = [];
  for (const action of actions) {
    // Safety checks
    if (action.type === 'file_write' && !isAllowedPath(action.path, ctx.config)) {
      results.push({ success: false, output: `BLOCKED: ${action.path} is not in allowed paths` });
      continue;
    }
    if (action.type === 'shell' && !ctx.config.allowShellCommands) {
      results.push({ success: false, output: 'BLOCKED: Shell commands not allowed in this config' });
      continue;
    }
    if (action.type === 'shell' && !isAllowedCommand(action.command, ctx.config)) {
      results.push({ success: false, output: `BLOCKED: Command not in allowed list` });
      continue;
    }
    
    const result = await executeOnDevMac(ctx.sshTarget, action);
    results.push(result);
  }
  
  // 5. Run build check if configured
  let buildPassed = true;
  if (ctx.config.requireBuildPass && actions.some(a => a.type === 'file_write')) {
    const buildResult = await runBuildCheck(ctx);
    buildPassed = buildResult.success;
  }
  
  // 6. Run test check if configured
  let testPassed = true;
  if (ctx.config.requireTestPass && buildPassed) {
    const testResult = await runTestCheck(ctx);
    testPassed = testResult.success;
  }
  
  // 7. Determine if we should continue
  const allDone = aiResponse.content.includes('[DONE]') || aiResponse.content.includes('[COMPLETE]');
  const shouldContinue = !allDone && buildPassed && (testPassed || !ctx.config.requireTestPass);
  
  return {
    continue: shouldContinue,
    action: actions.map(a => a.type).join(', '),
    description: aiResponse.content.slice(0, 500),
    filesChanged: actions.filter(a => a.type === 'file_write').map(a => a.path),
    output: results.map(r => r.output).join('\n').slice(0, 2000),
    success: buildPassed && testPassed,
  };
}

/**
 * Main orchestrator — runs the full loop.
 */
export async function runAgentLoop(loopId: string) {
  const loop = await prisma.agentLoop.findUnique({
    where: { id: loopId },
    include: { config: true, deliberation: true, story: true },
  });
  if (!loop || loop.status !== 'pending') return;

  // Update status
  await prisma.agentLoop.update({
    where: { id: loopId },
    data: { status: 'running', startedAt: new Date() },
  });

  const ctx: LoopContext = {
    loopId,
    plan: loop.deliberation?.summary || loop.story?.description || '',
    repoPath: loop.targetRepo === 'deepterm-web' 
      ? '~/deepterm'      // Web repo on Pi? Or AI Dev Mac?
      : '~/Development/deepterm',  // App repo on AI Dev Mac
    branch: `agent/${loop.story?.id || loop.id}`,
    config: loop.config,
    sshTarget: 'luca@192.168.1.249', // AI Dev Mac
  };

  try {
    // Create branch
    await executeOnDevMac(ctx.sshTarget, {
      type: 'shell',
      command: `cd ${ctx.repoPath} && git fetch origin && git checkout -b ${ctx.branch} origin/develop`,
    });

    await prisma.agentLoop.update({
      where: { id: loopId },
      data: { branch: ctx.branch },
    });

    // Iterate
    for (let i = 1; i <= ctx.config.maxIterations; i++) {
      // Check for cancellation
      const current = await prisma.agentLoop.findUnique({ where: { id: loopId } });
      if (current?.status === 'cancelled') break;

      // Check time limit
      const elapsed = (Date.now() - (loop.startedAt?.getTime() || Date.now())) / 60000;
      if (elapsed > ctx.config.maxDurationMins) {
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: { status: 'failed', errorLog: 'Time limit exceeded' },
        });
        break;
      }

      // Check checkpoint
      if (ctx.config.pauseAfterNIterations > 0 && i % ctx.config.pauseAfterNIterations === 0) {
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: { status: 'paused', iterationCount: i },
        });
        // Send WhatsApp notification
        await notifyPause(loop, i);
        return; // Will be resumed by human
      }

      // Execute iteration
      const result = await executeIteration(ctx, i);

      // Log iteration
      await prisma.agentIteration.create({
        data: {
          loopId,
          number: i,
          action: result.action,
          description: result.description,
          filesChanged: JSON.stringify(result.filesChanged),
          output: result.output,
          success: result.success,
        },
      });

      await prisma.agentLoop.update({
        where: { id: loopId },
        data: { iterationCount: i },
      });

      // Check file limit
      const totalFiles = await getTotalFilesChanged(loopId);
      if (totalFiles > ctx.config.maxFilesChanged) {
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: { status: 'failed', errorLog: `File limit exceeded (${totalFiles}/${ctx.config.maxFilesChanged})` },
        });
        break;
      }

      if (!result.continue) {
        // Agent signaled completion
        if (ctx.config.autoCommit) {
          await commitAndPush(ctx);
        }
        if (ctx.config.autoCreatePR) {
          const pr = await createPR(ctx, loop);
          await prisma.agentLoop.update({
            where: { id: loopId },
            data: { prNumber: pr.number, prUrl: pr.url },
          });
        }
        await prisma.agentLoop.update({
          where: { id: loopId },
          data: {
            status: 'awaiting_review',
            completedAt: new Date(),
            finalSummary: result.description,
          },
        });
        // Notify
        await notifyCompletion(loop);
        return;
      }
    }

    // Max iterations reached
    if (ctx.config.autoCommit) await commitAndPush(ctx);
    if (ctx.config.autoCreatePR) await createPR(ctx, loop);
    await prisma.agentLoop.update({
      where: { id: loopId },
      data: { status: 'awaiting_review', completedAt: new Date() },
    });

  } catch (error) {
    await prisma.agentLoop.update({
      where: { id: loopId },
      data: {
        status: 'failed',
        errorLog: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

function buildAgentSystemPrompt(config: AgentLoopConfig): string {
  return `You are an autonomous coding agent working on DeepTerm.
You implement changes by outputting structured actions.

Available actions:
- FILE_WRITE: Create or overwrite a file
- FILE_EDIT: Edit specific lines in a file  
- FILE_READ: Read a file's contents
${config.allowShellCommands ? '- SHELL: Run a shell command' : ''}
- BUILD: Run the build command
- TEST: Run the test command
- DONE: Signal that implementation is complete

Output each action as:
[ACTION:FILE_WRITE]
path: Sources/Views/MyFile.swift
content:
\`\`\`
// file content here
\`\`\`
[/ACTION]

Rules:
- Only modify files matching these paths: ${config.allowedPaths}
- NEVER modify: ${config.forbiddenPaths}
- Run BUILD after making code changes to verify compilation
- When all tasks are complete, output [DONE] with a summary
- If stuck after 3 attempts at the same error, output [STUCK] with details
- Keep changes minimal and focused on the task`;
}
```

### API Routes

```
POST /api/admin/cockpit/agent-loops/start
  Body: { storyId?, epicId?, deliberationId?, configName?: string, targetRepo?: string }
  → Creates AgentLoop, kicks off execution on AI Dev Mac
  → Returns: { loopId, status: "running" }

GET /api/admin/cockpit/agent-loops/[id]
  → Returns full loop with iterations

POST /api/admin/cockpit/agent-loops/[id]/pause
  → Pauses the loop after current iteration

POST /api/admin/cockpit/agent-loops/[id]/resume
  Body: { feedback?: string }
  → Resumes a paused loop, optionally with human feedback

POST /api/admin/cockpit/agent-loops/[id]/cancel
  → Cancels the loop, cleans up branch

GET /api/admin/cockpit/agent-loops/configs
  → Returns all available configurations

POST /api/admin/cockpit/agent-loops/configs
  Body: { name, description, ...settings }
  → Creates new configuration preset

PATCH /api/admin/cockpit/agent-loops/configs/[id]
  → Updates configuration

GET /api/admin/cockpit/agent-loops/active
  → Returns currently running loops (for dashboard)
```

### Cockpit UI — Agent Loop View

On the story detail or deliberation view, after decision:

```
┌─────────────────────────────────────────────────────────┐
│ 🤖 Agent Loop: Vault Tier Alignment                     │
│ Status: ▶️ Running (iteration 7/20)                      │
│ Config: default │ Branch: agent/cly8abc123               │
│ Duration: 4m 32s │ Tokens: 124,500                       │
│                                                          │
│ ┌─ Live Progress ──────────────────────────────────────┐ │
│ │  ✅ #1 file_write  src/lib/plan-limits.ts    (2.1s)  │ │
│ │  ✅ #2 file_write  src/lib/zk/vault-limits.ts (1.8s)│ │
│ │  ✅ #3 build       BUILD SUCCEEDED           (12.4s) │ │
│ │  ✅ #4 file_edit   accounts/license/route.ts  (1.5s) │ │
│ │  ✅ #5 file_edit   app/tiers/route.ts         (1.3s) │ │
│ │  ✅ #6 build       BUILD SUCCEEDED           (11.8s) │ │
│ │  🔄 #7 file_edit   vault-items/bulk/route.ts  ...    │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ Files changed: 6 / 30 max                                │
│ ████████░░░░░░░░░░░░ 35% iterations                     │
│                                                          │
│ [⏸ Pause] [⏹ Cancel] [📋 View Diff]                     │
└─────────────────────────────────────────────────────────┘
```

### Settings UI — Agent Loop Configurations

Add to the cockpit or settings, a configuration manager:

```
┌─ Agent Loop Configurations ─────────────────────────────┐
│                                                          │
│ ┌──────────┬────────────┬───────┬────────┬──────────┐   │
│ │ Name     │ Max Iter   │ Files │ Auto   │ Safety   │   │
│ ├──────────┼────────────┼───────┼────────┼──────────┤   │
│ │ default  │ 20 / 60min │ 30    │ ✅ PR  │ 🔒 Build │   │
│ │ careful  │ 10 / 30min │ 10    │ ❌     │ 🔒🔒 All │   │
│ │ fast     │ 30 / 90min │ 50    │ ✅ All │ 🔓 Build │   │
│ │ docs-only│ 10 / 20min │ 15    │ ✅ PR  │ 📝 None  │   │
│ │ web-only │ 20 / 45min │ 25    │ ✅ PR  │ 🔒 Build │   │
│ └──────────┴────────────┴───────┴────────┴──────────┘   │
│                                                          │
│ [+ New Config] [Edit] [Duplicate] [Delete]               │
└─────────────────────────────────────────────────────────┘
```

### Full Story Automation Flow

With all three features connected, a story can flow automatically:

```
1. Story created (from deliberation, GitHub issue, or manual)
         │
2. Status → "in_progress" (manual or via cockpit)
         │
3. Deliberation starts automatically
   🏗️ Architect proposes    →  debate  →  vote  →  decision
   🔒 Security proposes     →
   ⚡ Pragmatist proposes   →
         │
4. Agent loop starts (manual or auto-after-deliberation)
   Config: "default" (20 iterations, build check, auto-PR)
   🤖 Coding on AI Dev Mac...
   Iteration 1: Create files     ✅
   Iteration 2: Build            ✅
   Iteration 3: Add more code    ✅
   Iteration 4: Build            ✅
   Iteration 5: Write tests      ✅
   Iteration 6: Run tests        ✅
   Iteration 7: Update docs      ✅
   [DONE] → commit → push → PR #42 created
         │
5. WhatsApp: "🤖 PR #42 ready — 7 files changed, all builds pass"
         │
6. You review PR → approve → merge
         │
7. Implementation report auto-generated from PR diff
   Tests: 3 added ✅, Docs: 1 updated ✅, Help: 0 ⚠️
         │
8. Story → "done"
```

### Environment / Prerequisites

For the agent loop to work, the AI Dev Mac needs:
- SSH access from Pi (already configured: `luca@192.168.1.249`)
- Git configured with push access to both repos
- Xcode installed (for app builds)
- Node.js installed (for web builds)
- The repos cloned

These are covered by the AI Dev Mac setup (which we still need to complete — Docker test hosts + Homebrew were in progress).

### Files to Create (Additional)

| File | Purpose |
|------|---------|
| `src/lib/agent-loop-engine.ts` | Core loop execution engine |
| `src/app/api/admin/cockpit/agent-loops/start/route.ts` | Start agent loop |
| `src/app/api/admin/cockpit/agent-loops/[id]/route.ts` | Get loop details |
| `src/app/api/admin/cockpit/agent-loops/[id]/pause/route.ts` | Pause loop |
| `src/app/api/admin/cockpit/agent-loops/[id]/resume/route.ts` | Resume loop |
| `src/app/api/admin/cockpit/agent-loops/[id]/cancel/route.ts` | Cancel loop |
| `src/app/api/admin/cockpit/agent-loops/configs/route.ts` | Config CRUD |
| `src/app/api/admin/cockpit/agent-loops/configs/[id]/route.ts` | Config update |
| `src/app/api/admin/cockpit/agent-loops/active/route.ts` | Running loops |
| `src/app/admin/cockpit/components/AgentLoopView.tsx` | Loop progress UI |
| `src/app/admin/cockpit/components/AgentLoopConfigManager.tsx` | Config management UI |

### Files to Modify (Additional)

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add AgentLoop, AgentIteration, AgentLoopConfig models + relations |
| `src/lib/ai-activities.ts` | Add agent.implementer, agent.web_implementer, agent.test_writer, agent.doc_writer |
| `src/app/admin/cockpit/components/PlanningTab.tsx` | Add "Run Agent" button on stories after deliberation |
| `src/app/admin/cockpit/components/DeliberationView.tsx` | Add "Start Agent Loop" after decision |
| `src/app/admin/cockpit/page.tsx` | Add active loop indicator in header |
| `src/app/admin/cockpit/types.ts` | Add AgentLoop, AgentIteration, AgentLoopConfig types |

---

*End of Addendum — Agent Loops & Configuration — 2026-02-26*


---

## Addendum: Token Consumption Monitor, Airflow Orchestration & Settings Reorg

### 1. AI Token Consumption Monitor

Track every AI call with provider, model, activity, tokens, and cost. Display in cockpit dashboard.

#### Database Schema

```prisma
/// Every AI API call is logged here.
model AIUsageLog {
  id            String   @id @default(cuid())
  provider      String   // "anthropic", "openai", "google", "mistral", "groq"
  model         String   // "claude-opus-4-6", "gpt-4o", etc.
  activity      String   // From AI_ACTIVITIES: "deliberation.architect", "agent.implementer", etc.
  category      String   // "deliberation", "review", "planning", "agent", "ci"
  
  // Token counts
  inputTokens   Int      @default(0)
  outputTokens  Int      @default(0)
  totalTokens   Int      @default(0)
  
  // Cost (estimated, in USD cents for precision)
  costCents     Float    @default(0)
  
  // Context — what triggered this call
  deliberationId String?
  agentLoopId    String?
  storyId        String?
  epicId         String?
  
  // Timing
  durationMs     Int     @default(0)
  success        Boolean @default(true)
  errorMessage   String?
  
  createdAt      DateTime @default(now())

  @@index([provider])
  @@index([activity])
  @@index([category])
  @@index([createdAt])
  @@index([deliberationId])
  @@index([agentLoopId])
}

/// Daily/monthly aggregates for fast dashboard queries.
model AIUsageAggregate {
  id            String   @id @default(cuid())
  period        String   // "2026-02-26" (daily) or "2026-02" (monthly)
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

#### Cost Calculation

Store cost-per-token on the `AIModel` model (already defined). Calculate at log time:

```typescript
// In ai-client.ts, after every callAI():

function calculateCost(model: AIModel, inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1000) * (model.costPer1kInput || 0);
  const outputCost = (outputTokens / 1000) * (model.costPer1kOutput || 0);
  return Math.round((inputCost + outputCost) * 100); // cents
}

// Default costs (USD per 1K tokens):
const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':              { input: 0.015, output: 0.075 },
  'claude-sonnet-4-5-20250929':   { input: 0.003, output: 0.015 },
  'claude-haiku-4-5-20251001':    { input: 0.0008, output: 0.004 },
  'gpt-4o':                       { input: 0.005, output: 0.015 },
  'gpt-4o-mini':                  { input: 0.00015, output: 0.0006 },
  'gemini-2.5-pro':               { input: 0.00125, output: 0.005 },
  'gemini-2.5-flash':             { input: 0.000075, output: 0.0003 },
  'mistral-large-latest':         { input: 0.002, output: 0.006 },
  'llama-3.3-70b-versatile':      { input: 0.00059, output: 0.00079 },
};
```

#### Integrate Logging into `callAI()`

Update `src/lib/ai-client.ts`:

```typescript
export async function callAI(
  activity: AIActivity,
  systemPrompt: string,
  messages: AIMessage[],
  options?: { maxTokens?: number; temperature?: number; context?: {
    deliberationId?: string;
    agentLoopId?: string;
    storyId?: string;
    epicId?: string;
  }}
): Promise<AIResponse> {
  const startTime = Date.now();
  const assignment = await getAssignment(activity);
  
  let response: AIResponse;
  let success = true;
  let errorMessage: string | undefined;
  
  try {
    response = await callProvider(assignment, systemPrompt, messages, options);
  } catch (error) {
    success = false;
    errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw error;
  } finally {
    const durationMs = Date.now() - startTime;
    const costCents = calculateCost(
      assignment.model,
      response?.inputTokens || 0,
      response?.outputTokens || 0
    );
    
    // Log asynchronously — don't block the response
    prisma.aIUsageLog.create({
      data: {
        provider: assignment.provider.slug,
        model: assignment.model.modelId,
        activity,
        category: AI_ACTIVITIES[activity].category,
        inputTokens: response?.inputTokens || 0,
        outputTokens: response?.outputTokens || 0,
        totalTokens: (response?.inputTokens || 0) + (response?.outputTokens || 0),
        costCents,
        durationMs,
        success,
        errorMessage,
        deliberationId: options?.context?.deliberationId,
        agentLoopId: options?.context?.agentLoopId,
        storyId: options?.context?.storyId,
        epicId: options?.context?.epicId,
      }
    }).catch(err => console.error('Failed to log AI usage:', err));
    
    // Update daily aggregate (fire and forget)
    updateAggregate(assignment, activity, response, durationMs, success)
      .catch(err => console.error('Failed to update aggregate:', err));
  }
  
  return response!;
}
```

#### API Routes

```
GET /api/admin/cockpit/ai-usage/summary
  Query: ?period=today|week|month|custom&from=&to=
  → Returns: totals by provider, by category, by activity
  → { totalCost, totalTokens, byProvider: [...], byCategory: [...], byActivity: [...] }

GET /api/admin/cockpit/ai-usage/timeline
  Query: ?period=week|month&granularity=hourly|daily
  → Returns: time-series data for charts
  → { points: [{ timestamp, tokens, cost, calls }] }

GET /api/admin/cockpit/ai-usage/details
  Query: ?activity=&provider=&limit=50&offset=0
  → Returns: paginated individual call logs

GET /api/admin/cockpit/ai-usage/by-story/[storyId]
  → Returns: all AI usage for a specific story (deliberation + agent loop)

GET /api/admin/cockpit/ai-usage/by-deliberation/[deliberationId]
  → Returns: breakdown per agent/phase
```

#### Cockpit UI — AI Usage Tab

New tab in cockpit:

```
[Overview] [Triage] [Planning] [Builds] [GitHub] [System] [🔍 Reviews] [📊 AI Usage]
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 📊 AI Token Usage                              Period: [Month ▾]│
│                                                                  │
│ ┌─ Summary Cards ─────────────────────────────────────────────┐ │
│ │  Total Cost     Total Tokens    API Calls     Avg Latency   │ │
│ │  $14.72         2.1M            347           1.2s          │ │
│ │  ▲ +23% vs last month                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ By Provider ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  Anthropic    ████████████████████████  $12.40  (84%)       │ │
│ │  OpenAI       ████                      $1.82   (12%)       │ │
│ │  Google       ██                        $0.50   (4%)        │ │
│ │  Groq         ░                         $0.00   (<1%)       │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ By Category ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │  🤖 Agent Loops   ██████████████████     $8.90  (60%)       │ │
│ │  🏗️ Deliberation  ████████               $3.20  (22%)       │ │
│ │  🔍 Reviews       ███                    $1.50  (10%)       │ │
│ │  📋 Planning      ██                     $0.82  (6%)        │ │
│ │  🔧 CI/PR Review  █                     $0.30  (2%)        │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Daily Trend (last 30 days) ────────────────────────────────┐ │
│ │  $2 ┤        ╭─╮                                            │ │
│ │     ┤   ╭──╮ │ │  ╭╮                                        │ │
│ │  $1 ┤╭─╮│  ╰─╯ ╰──╯╰╮  ╭╮                                 │ │
│ │     ┤│ ╰╯            ╰──╯╰──╮╭──                           │ │
│ │  $0 ┼─────────────────────────────── days                   │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Top Consumers (this month) ────────────────────────────────┐ │
│ │                                                              │ │
│ │  1. Vault Tier Alignment (Story)      $3.40  │ 12 calls     │ │
│ │     └ Deliberation: $1.20 │ Agent Loop: $2.20               │ │
│ │  2. Architecture Review #3            $2.80  │ 9 calls      │ │
│ │  3. Keychain Implementation (Epic)    $2.10  │ 18 calls     │ │
│ │  4. PR Code Reviews (automated)       $0.90  │ 34 calls     │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recent Calls ──────────────────────────────────────────────┐ │
│ │ Time     Activity              Model          Tokens  Cost  │ │
│ │ 14:22    agent.implementer     Claude Opus 4  4,200  $0.38 │ │
│ │ 14:21    agent.implementer     Claude Opus 4  3,800  $0.34 │ │
│ │ 14:18    deliberation.security GPT-4o         2,100  $0.04 │ │
│ │ 14:15    planning.propose      Claude Opus 4  5,400  $0.49 │ │
│ │ [View all →]                                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### Story/Epic Detail — Usage Breakdown

On each story/epic card in the Planning tab, show accumulated cost:

```
🔒 Vault Tier Alignment                    [done]    💰 $3.40
```

And in the detail view:

```
┌─ AI Usage for this Story ──────────────────┐
│ Total: $3.40 (487K tokens, 12 calls)       │
│                                             │
│ Deliberation:         $1.20                 │
│   🏗️ Architect:        $0.45 (Claude Opus)  │
│   🔒 Security:         $0.45 (Claude Opus)  │
│   ⚡ Pragmatist:       $0.12 (GPT-4o)       │
│   Debate (2 rounds):  $0.08                │
│   Vote + Synthesis:   $0.10                │
│                                             │
│ Agent Loop:           $2.20                 │
│   7 iterations × avg $0.31                 │
│   Model: Claude Opus 4                     │
└─────────────────────────────────────────────┘
```

---

### 2. Airflow for Cross-Platform Orchestration

The DeepTerm pipeline spans 4 machines (Main Mac → GitHub → CI Mac → Pi → Node-RED → AI Dev Mac). Currently, orchestration is ad-hoc (webhooks + SSH calls). Apache Airflow provides:

- **DAG-based workflows**: Visual pipeline definitions
- **Retry/timeout handling**: Built-in per-task
- **Scheduling**: Nightly builds, periodic reviews
- **Dependency management**: Task B waits for Task A
- **Monitoring**: Task duration, success/failure history, logs
- **Alerting**: Slack/WhatsApp on failures

#### Where Airflow Runs

On the **AI Dev Mac** (M4, 24GB RAM) — it has the resources and is already the automation hub. The cockpit on the web app provides the **read-only dashboard** view; Airflow handles the execution.

#### Installation

```bash
# On AI Dev Mac
pip3 install apache-airflow
airflow standalone  # Quick dev setup — creates SQLite DB + webserver on port 8080
```

For production, use the Docker Compose approach:
```bash
brew install --cask docker
curl -LfO 'https://airflow.apache.org/docs/apache-airflow/2.10.4/docker-compose.yaml'
docker compose up airflow-init
docker compose up -d
```

Airflow web UI at `http://192.168.1.249:8080` (AI Dev Mac).

#### DAG Definitions

```
deepterm/
  airflow/
    dags/
      story_implementation.py    # Full story lifecycle DAG
      architecture_review.py     # Architecture review DAG
      nightly_build.py           # Nightly build + test DAG
      release_pipeline.py        # Tag → build → sign → notarize → publish
      health_check.py            # Periodic system health checks
```

##### Example: Story Implementation DAG

```python
# dags/story_implementation.py
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.utils.dates import days_ago
from datetime import timedelta

default_args = {
    'owner': 'deepterm',
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
    'execution_timeout': timedelta(hours=2),
}

with DAG(
    'story_implementation',
    default_args=default_args,
    description='Full story lifecycle: deliberate → implement → review → report',
    schedule_interval=None,  # Triggered manually or via API
    start_date=days_ago(1),
    catchup=False,
    tags=['deepterm', 'story'],
    params={
        'story_id': '',
        'config_name': 'default',
        'target_repo': 'deepterm',
    },
) as dag:

    start_deliberation = PythonOperator(
        task_id='start_deliberation',
        python_callable=trigger_deliberation,
        op_kwargs={'story_id': '{{ params.story_id }}'},
    )

    wait_for_proposals = PythonOperator(
        task_id='wait_for_proposals',
        python_callable=poll_deliberation_status,
        op_kwargs={'expected_status': 'debating'},
        retries=30,
        retry_delay=timedelta(seconds=10),
    )

    run_debate = PythonOperator(
        task_id='run_debate',
        python_callable=advance_deliberation,
    )

    run_vote = PythonOperator(
        task_id='run_vote',
        python_callable=advance_deliberation,
    )

    synthesize = PythonOperator(
        task_id='synthesize_decision',
        python_callable=advance_deliberation,
    )

    start_agent_loop = PythonOperator(
        task_id='start_agent_loop',
        python_callable=trigger_agent_loop,
        op_kwargs={
            'story_id': '{{ params.story_id }}',
            'config_name': '{{ params.config_name }}',
        },
    )

    wait_for_agent = PythonOperator(
        task_id='wait_for_agent_completion',
        python_callable=poll_agent_loop_status,
        op_kwargs={'expected_status': 'awaiting_review'},
        retries=120,
        retry_delay=timedelta(seconds=30),
        execution_timeout=timedelta(hours=2),
    )

    notify_review = PythonOperator(
        task_id='notify_for_review',
        python_callable=send_whatsapp_notification,
        op_kwargs={'template': 'pr_ready_for_review'},
    )

    # Manual gate — human approves/rejects PR
    # (In practice, this waits for a webhook callback from GitHub)
    wait_for_approval = PythonOperator(
        task_id='wait_for_pr_approval',
        python_callable=poll_pr_status,
        retries=2880,  # Check every 30s for up to 24 hours
        retry_delay=timedelta(seconds=30),
    )

    generate_report = PythonOperator(
        task_id='generate_implementation_report',
        python_callable=trigger_report_generation,
    )

    mark_done = PythonOperator(
        task_id='mark_story_done',
        python_callable=update_story_status,
        op_kwargs={'status': 'done'},
    )

    # Pipeline
    (start_deliberation 
     >> wait_for_proposals 
     >> run_debate 
     >> run_vote 
     >> synthesize 
     >> start_agent_loop 
     >> wait_for_agent 
     >> notify_review 
     >> wait_for_approval 
     >> generate_report 
     >> mark_done)
```

##### Example: Nightly Build DAG

```python
with DAG(
    'nightly_build',
    schedule_interval='0 2 * * *',  # 2 AM daily
    tags=['deepterm', 'ci'],
) as dag:

    pull_latest = BashOperator(
        task_id='pull_latest',
        bash_command='ssh ci-mac "cd ~/Development/deepterm && git pull"',
    )

    build_app = BashOperator(
        task_id='build_app',
        bash_command='ssh ci-mac "cd ~/Development/deepterm && xcodebuild build ..."',
        execution_timeout=timedelta(minutes=30),
    )

    run_unit_tests = BashOperator(
        task_id='run_unit_tests',
        bash_command='ssh ci-mac "cd ~/Development/deepterm && xcodebuild test ..."',
    )

    run_ui_tests = BashOperator(
        task_id='run_ui_tests',
        bash_command='ssh ci-mac "cd ~/Development/deepterm && xcodebuild test -scheme DeepTermUITests ..."',
    )

    build_web = BashOperator(
        task_id='build_web',
        bash_command='ssh macan@10.10.10.10 "cd ~/deepterm && npm run build"',
    )

    health_report = PythonOperator(
        task_id='send_health_report',
        python_callable=send_nightly_report,
    )

    pull_latest >> [build_app, build_web]
    build_app >> [run_unit_tests, run_ui_tests]
    [run_unit_tests, run_ui_tests, build_web] >> health_report
```

#### Cockpit Integration — Airflow Dashboard Embed

The cockpit doesn't replace Airflow's UI — it embeds a **summary view**. The full Airflow UI is available at `http://192.168.1.249:8080`.

New cockpit tab:

```
[Overview] [Triage] [Planning] [Builds] [GitHub] [System] [Reviews] [AI Usage] [🔄 Pipelines]
```

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔄 Pipeline Orchestration              [Open Airflow UI ↗]     │
│                                                                  │
│ ┌─ Active Runs ───────────────────────────────────────────────┐ │
│ │                                                              │ │
│ │ ▶ story_implementation (Story: Vault Tier Alignment)        │ │
│ │   ✅ deliberate → ✅ debate → ✅ vote → 🔄 agent_loop      │ │
│ │   Running for: 12m │ Current: iteration 5/20                │ │
│ │                                                              │ │
│ │ ▶ nightly_build                                             │ │
│ │   ✅ pull → ✅ build_app → 🔄 unit_tests → ⬜ ui_tests     │ │
│ │   Running for: 8m                                           │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Recent Runs (last 7 days) ─────────────────────────────────┐ │
│ │ DAG                      Last Run    Status   Duration      │ │
│ │ nightly_build            02:00 today  ✅       23m          │ │
│ │ story_implementation     yesterday    ✅       1h 12m       │ │
│ │ architecture_review      3 days ago   ✅       8m           │ │
│ │ nightly_build            02:00 yest.  ❌       15m (fail)   │ │
│ │ [View all →]                                                │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                  │
│ ┌─ Scheduled ─────────────────────────────────────────────────┐ │
│ │ nightly_build            Daily 2:00 AM    Next: tomorrow    │ │
│ │ health_check             Every 6 hours    Next: 18:00       │ │
│ └──────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

#### API Routes — Airflow Proxy

The cockpit fetches data from Airflow's REST API (port 8080 on AI Dev Mac) and proxies it:

```
GET /api/admin/cockpit/pipelines/runs
  → Proxies: GET http://192.168.1.249:8080/api/v1/dags/~/dagRuns?limit=20
  → Returns: formatted list of DAG runs

GET /api/admin/cockpit/pipelines/runs/[dagId]/[runId]
  → Proxies: GET http://192.168.1.249:8080/api/v1/dags/{dagId}/dagRuns/{runId}/taskInstances
  → Returns: task-level status for a specific run

POST /api/admin/cockpit/pipelines/trigger
  Body: { dagId, params }
  → Proxies: POST http://192.168.1.249:8080/api/v1/dags/{dagId}/dagRuns
  → Triggers a DAG run with parameters

GET /api/admin/cockpit/pipelines/dags
  → Proxies: GET http://192.168.1.249:8080/api/v1/dags
  → Returns: list of all DAGs with schedule info
```

Store Airflow connection details in SystemSettings:
```
Key: airflow_base_url    Value: http://192.168.1.249:8080
Key: airflow_username    Value: admin
Key: airflow_password    Value: (encrypted)
```

#### Files to Create

| File | Purpose |
|------|---------|
| `airflow/dags/story_implementation.py` | Full story lifecycle DAG |
| `airflow/dags/architecture_review.py` | Review DAG |
| `airflow/dags/nightly_build.py` | Nightly build + test |
| `airflow/dags/release_pipeline.py` | Release DAG |
| `airflow/dags/health_check.py` | System health DAG |
| `airflow/dags/lib/deepterm_api.py` | Shared helpers (API calls to Pi) |
| `src/app/api/admin/cockpit/ai-usage/summary/route.ts` | Usage summary |
| `src/app/api/admin/cockpit/ai-usage/timeline/route.ts` | Usage timeline |
| `src/app/api/admin/cockpit/ai-usage/details/route.ts` | Usage details |
| `src/app/api/admin/cockpit/ai-usage/by-story/[storyId]/route.ts` | Per-story usage |
| `src/app/api/admin/cockpit/pipelines/runs/route.ts` | Airflow proxy |
| `src/app/api/admin/cockpit/pipelines/trigger/route.ts` | Trigger DAGs |
| `src/app/admin/cockpit/components/AIUsageTab.tsx` | Usage dashboard |
| `src/app/admin/cockpit/components/PipelinesTab.tsx` | Pipeline dashboard |

---

### 3. Settings Page Reorganization

The current settings page is a single long scroll with 9 sections. Reorganize into logical tabs.

#### Current Sections → New Tab Mapping

| Current Section | New Tab | Rationale |
|----------------|---------|-----------|
| General (site name, URL, support email) | 🏠 General | Core site identity |
| Help Page | 🏠 General | Part of site content |
| Registration & Security | 🔐 Security | Auth and access control |
| Admin 2FA / Passkeys | 🔐 Security | Auth and access control |
| Subscription Defaults | 💳 Billing | Payment and plans |
| Stripe webhook secret | 💳 Billing | Payment infrastructure |
| Release Notifications (email toggle) | 📬 Notifications | All notification config |
| Email / SMTP test | 📬 Notifications | Email delivery |
| WhatsApp / Node-RED test | 📬 Notifications | WhatsApp delivery |
| App Releases (upload DMG) | 📦 Releases | Release management |
| **NEW** AI Providers | 🤖 AI & LLM | Provider keys and model assignments |
| **NEW** AI Activity Assignments | 🤖 AI & LLM | Which model for which task |
| **NEW** Agent Loop Configs | 🤖 AI & LLM | Agent behavior presets |
| **NEW** Airflow Connection | 🔄 Integrations | External service connections |
| **NEW** Node-RED Connection | 🔄 Integrations | External service connections |
| **NEW** GitHub Connection | 🔄 Integrations | API token, webhook secret |
| Danger Zone | ⚠️ Danger Zone | Always last, always visible |

#### Final Tab Structure

```
┌──────────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                                  │
│                                                               │
│ [🏠 General] [🔐 Security] [💳 Billing] [📬 Notifications]  │
│ [📦 Releases] [🤖 AI & LLM] [🔄 Integrations] [⚠️ Danger]  │
└──────────────────────────────────────────────────────────────┘
```

#### Tab Details

##### 🏠 General
```
Site Name:        [DeepTerm]
Site URL:         [https://deepterm.net]
Support Email:    [support@deepterm.net]
Maintenance Mode: [Toggle]

─── Help Page Content ───
[Rich text editor for help page]
[Save]
```

##### 🔐 Security
```
─── Registration ───
Allow Registration:          [Toggle]
Require Email Verification:  [Toggle]

─── Admin Authentication ───
Two-Factor Authentication:   ✅ Enabled
Backup Codes Remaining:      8/10

─── Passkeys ───
┌─────────────────────────────────────┐
│ Admin Passkey (Touch ID) │ [Remove] │
│ Added: 2026-02-15        │          │
└─────────────────────────────────────┘
[+ Register New Passkey]
```

##### 💳 Billing
```
─── Subscription Defaults ───
Max Team Size:     [50]
Trial Days:        [14]
Default Plan:      [Starter ▾]

─── Stripe ───
Webhook Secret:    [whsec_•••••••••] [Edit]
Mode:              🟢 Live (or 🟡 Test)
[Test Webhook]
```

##### 📬 Notifications
```
─── Email ───
Notify Users on New Version: [Toggle]
SMTP Status:                 🟢 Connected

Test Email:
  Recipient: [______@____] [Send Test]
  ✅ Test email sent successfully

─── WhatsApp (via Node-RED) ───
Node-RED Status:             🟢 Connected (192.168.1.30:1880)

Test WhatsApp:
  Type: [Triage ▾] [Send Test]
  ✅ WhatsApp sent successfully
```

##### 📦 Releases
```
─── App Releases ───
Upload new release:
  Platform:  [macOS ▾]
  Version:   [______]
  File:      [Choose .dmg]
  Notes:     [________________]
  [Upload Release]

─── Recent Releases ───
┌─────────────────────────────────────┐
│ v1.0.3 │ macOS │ 2026-02-20 │ 14MB │
│ v1.0.2 │ macOS │ 2026-02-10 │ 14MB │
└─────────────────────────────────────┘
```

##### 🤖 AI & LLM
```
─── Providers ───
(See AI Provider Management section above)

─── Model Assignments ───
(See Activity assignment table above)

─── Agent Loop Configurations ───
(See Agent Loop Config Manager above)

─── Usage Budget (Optional) ───
Monthly Budget:    [$50.00]
Alert at:          [80%]
Hard Limit:        [Toggle] (pause all AI when budget exceeded)
```

##### 🔄 Integrations
```
─── GitHub ───
Token:            [ghp_•••••••••] [Edit] [Validate]
Webhook Secret:   [••••••••] [Edit]
App Repo:         deblasioluca/deepterm
Web Repo:         deblasioluca/deepterm-web
Status:           🟢 Connected

─── Node-RED ───
URL:              [http://192.168.1.30:1880]
API Key:          [•••••••] [Edit]
Status:           🟢 Connected
[Test Connection]

─── Airflow ───
URL:              [http://192.168.1.249:8080]
Username:         [admin]
Password:         [•••••••] [Edit]
Status:           🟢 Connected (5 DAGs)
[Test Connection] [Open Airflow UI ↗]

─── AI Dev Mac ───
SSH Host:         [luca@192.168.1.249]
Status:           🟢 Reachable
Last Heartbeat:   2 minutes ago
[Test Connection]
```

##### ⚠️ Danger Zone
```
─── Dangerous Actions ───
⚠️ These actions cannot be undone.

[Reset All Statistics]     Clears all AI usage logs and aggregates
[Purge Deleted Items]      Permanently removes soft-deleted vault items
[Reset Admin Password]     Generates new admin password
[Factory Reset]            Resets all settings to defaults
```

#### Implementation

Refactor `src/app/admin/settings/page.tsx` (currently 1215 lines) into:

```
src/app/admin/settings/
  page.tsx                        (Tab container — ~80 lines)
  components/
    GeneralTab.tsx                (Site name, URL, help page)
    SecurityTab.tsx               (Registration, 2FA, passkeys)
    BillingTab.tsx                (Stripe, subscription defaults)
    NotificationsTab.tsx          (Email, WhatsApp)
    ReleasesTab.tsx               (App release upload)
    AISettingsTab.tsx             (Providers, assignments, agent configs, budget)
    IntegrationsTab.tsx           (GitHub, Node-RED, Airflow, AI Dev Mac)
    DangerZoneTab.tsx             (Destructive actions)
```

The main `page.tsx` becomes a simple tab container:

```typescript
'use client';

import { useState } from 'react';
import GeneralTab from './components/GeneralTab';
import SecurityTab from './components/SecurityTab';
import BillingTab from './components/BillingTab';
import NotificationsTab from './components/NotificationsTab';
import ReleasesTab from './components/ReleasesTab';
import AISettingsTab from './components/AISettingsTab';
import IntegrationsTab from './components/IntegrationsTab';
import DangerZoneTab from './components/DangerZoneTab';

const TABS = [
  { key: 'general', label: '🏠 General', component: GeneralTab },
  { key: 'security', label: '🔐 Security', component: SecurityTab },
  { key: 'billing', label: '💳 Billing', component: BillingTab },
  { key: 'notifications', label: '📬 Notifications', component: NotificationsTab },
  { key: 'releases', label: '📦 Releases', component: ReleasesTab },
  { key: 'ai', label: '🤖 AI & LLM', component: AISettingsTab },
  { key: 'integrations', label: '🔄 Integrations', component: IntegrationsTab },
  { key: 'danger', label: '⚠️ Danger Zone', component: DangerZoneTab },
];

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || GeneralTab;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <div className="flex flex-wrap gap-2 mb-8 border-b border-border-primary pb-4">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key 
                ? 'bg-accent-primary text-white' 
                : 'text-text-secondary hover:bg-bg-secondary'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <ActiveComponent />
    </div>
  );
}
```

#### Migration Strategy

1. Create all tab component files
2. Move existing code from the 1215-line page.tsx into appropriate tabs
3. Keep all API routes unchanged — tabs just reorganize the frontend
4. Add new tabs (AI & LLM, Integrations) with new functionality
5. Test each tab independently

---

### Implementation Priority (Combined)

| Phase | What | Priority |
|-------|------|----------|
| 1 | Settings tab refactor (split page.tsx into 8 components) | High — foundational |
| 2 | AI Usage logging in `callAI()` + AIUsageLog schema | High — needed before scaling AI use |
| 3 | AI Usage cockpit tab (summary, timeline, per-story) | High — visibility |
| 4 | AI & LLM settings tab (providers, assignments) | High — enables multi-provider |
| 5 | Integrations tab (GitHub, Node-RED, Airflow, SSH) | Medium |
| 6 | Airflow installation on AI Dev Mac | Medium |
| 7 | Core DAGs (nightly_build, story_implementation) | Medium |
| 8 | Pipeline cockpit tab (Airflow proxy) | Medium |
| 9 | AI budget / alerting | Low |

---

*End of Addendum — Token Monitor, Airflow, Settings Reorg — 2026-02-26*
