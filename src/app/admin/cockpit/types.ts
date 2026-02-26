export interface HealthData {
  pi: { status: string; uptimeSeconds: number; memoryMB: number; heapMB: number };
  nodeRed: { status: string };
  ciMac: { status: string };
}

export interface CiBuild {
  id: string;
  runId: string;
  repo: string;
  branch: string;
  workflow: string;
  conclusion: string | null;
  commitMessage: string | null;
  duration: number | null;
  url: string | null;
  createdAt: string;
}

export interface GithubEvent {
  id: string;
  eventType: string;
  repo: string;
  branch: string | null;
  actor: string | null;
  summary: string | null;
  url: string | null;
  createdAt: string;
}

export interface QuickStats {
  issues: { total: number; open: number };
  ideas: number;
  releases: { total: number; latest: string };
  users: number;
}

export interface GithubLabel {
  name: string;
  color: string;
}

export interface GithubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: GithubLabel[];
  milestone: string | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  url: string;
}

export interface GithubIssuesData {
  open: number;
  closed: number;
  items: GithubIssue[];
  lastSyncedAt: string | null;
}

export interface TriageIssue {
  id: string;
  title: string;
  description: string;
  area: string;
  status: string;
  reporter: string;
  createdAt: string;
}

export interface TriageIdea {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  author: string;
  votes: number;
  createdAt: string;
}

export interface TriageQueue {
  issues: TriageIssue[];
  ideas: TriageIdea[];
}

export interface PaymentEvent {
  id: string;
  email: string;
  event: string;
  plan: string;
  amount: number | null;
  details: string | null;
  createdAt: string;
}

export interface RevenueData {
  totalUsers: number;
  proUsers: number;
  freeUsers: number;
  conversionRate: string;
  recentPayments: PaymentEvent[];
}

export interface Epic {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  sortOrder: number;
  stories: Story[];
  createdAt: string;
  updatedAt: string;
  deliberationCount?: number;
  activeDeliberationId?: string | null;
  hasReport?: boolean;
  aiCostCents?: number;
}

export interface Story {
  id: string;
  epicId: string | null;
  title: string;
  description: string;
  status: string;
  priority: string;
  githubIssueNumber: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deliberationCount?: number;
  activeDeliberationId?: string | null;
  hasReport?: boolean;
  aiCostCents?: number;
}

export interface PlanningData {
  epics: Epic[];
  unassignedStories: Story[];
}

// ── Pipeline types ──

export interface PipelineDag {
  dagId: string;
  description: string;
  schedule: string | null;
  isPaused: boolean;
  tags: string[];
  nextRun: string | null;
}

export interface PipelineRun {
  dagId: string;
  runId: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  conf: Record<string, unknown>;
}

export interface PipelineTask {
  taskId: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  duration: number | null;
  tryNumber: number;
}

export interface PipelineData {
  connected: boolean;
  dags: PipelineDag[];
  activeRuns: PipelineRun[];
  recentRuns: PipelineRun[];
  errorMessage?: string;
}

export interface CockpitData {
  health: HealthData;
  builds: CiBuild[];
  events: GithubEvent[];
  stats: QuickStats;
  githubIssues: GithubIssuesData;
  triageQueue: TriageQueue;
  revenue: RevenueData;
  planning: PlanningData;
  pipelines?: PipelineData;
  timestamp: string;
}

export type RunAction = (action: string, payload?: Record<string, unknown>) => Promise<void>;

// ── Deliberation types ──

export interface DeliberationProposalData {
  id: string;
  agentName: string;
  agentModel: string;
  content: string;
  strengths: string;
  risks: string;
  effort: string;
  createdAt: string;
}

export interface DeliberationDebateData {
  id: string;
  round: number;
  agentName: string;
  agentModel: string;
  content: string;
  referencesProposalIds: string;
  createdAt: string;
}

export interface DeliberationVoteData {
  id: string;
  agentName: string;
  agentModel: string;
  votedFor: string;
  votedProposalId: string | null;
  reasoning: string;
  createdAt: string;
}

export interface DeliberationSummary {
  id: string;
  type: string;
  status: string;
  storyId: string | null;
  epicId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { proposals: number; debates: number; votes: number };
}

export interface DeliberationDetail extends DeliberationSummary {
  instructions: string;
  summary: string;
  managementSummary: string;
  error: string | null;
  proposals: DeliberationProposalData[];
  debates: DeliberationDebateData[];
  votes: DeliberationVoteData[];
  story?: { id: string; title: string; status: string; priority: string; githubIssueNumber: number | null } | null;
  epic?: { id: string; title: string; status: string; priority: string } | null;
}

// ── AI Usage types ──

export interface AIUsageLogEntry {
  id: string;
  provider: string;
  model: string;
  activity: string;
  category: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCents: number;
  deliberationId: string | null;
  agentLoopId: string | null;
  storyId: string | null;
  epicId: string | null;
  durationMs: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface AIUsageSummary {
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
  byProvider: Array<{
    provider: string;
    calls: number;
    totalTokens: number;
    costCents: number;
    costDollars: string;
  }>;
  byCategory: Array<{
    category: string;
    calls: number;
    totalTokens: number;
    costCents: number;
    costDollars: string;
  }>;
  byActivity: Array<{
    activity: string;
    model: string;
    calls: number;
    totalTokens: number;
    costCents: number;
  }>;
  topConsumers: Array<{
    storyId: string;
    title: string;
    calls: number;
    totalTokens: number;
    costCents: number;
    costDollars: string;
  }>;
}

export interface AIUsageTimeline {
  granularity: string;
  points: Array<{
    date: string;
    tokens: number;
    costCents: number;
    calls: number;
    errors: number;
  }>;
}

export interface ImplementationReportData {
  id: string;
  storyId: string | null;
  epicId: string | null;
  status: string;
  testsAdded: string;
  testsUpdated: string;
  docsUpdated: string;
  helpPagesUpdated: string;
  filesChanged: string;
  prNumbers: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}
