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
}

export interface PlanningData {
  epics: Epic[];
  unassignedStories: Story[];
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
  timestamp: string;
}

export type RunAction = (action: string, payload?: Record<string, unknown>) => Promise<void>;
