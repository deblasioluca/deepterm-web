/**
 * AI Activity Registry — defines all AI-powered tasks in the system.
 * Each activity maps to one model via AIActivityAssignment in the database.
 */

export interface AIActivityDef {
  key: string;
  label: string;
  description: string;
  category: 'deliberation' | 'planning' | 'reports' | 'issues' | 'ci' | 'agent';
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
}

export const AI_ACTIVITIES: Record<string, AIActivityDef> = {
  // Deliberation system — proposal agents
  'deliberation.proposal.architect': {
    key: 'deliberation.proposal.architect',
    label: 'Architect Proposal',
    description: 'Architect agent generating implementation proposals',
    category: 'deliberation',
    defaultModel: 'claude-opus-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },
  'deliberation.proposal.security': {
    key: 'deliberation.proposal.security',
    label: 'Security Proposal',
    description: 'Security engineer agent generating proposals',
    category: 'deliberation',
    defaultModel: 'claude-opus-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },
  'deliberation.proposal.pragmatist': {
    key: 'deliberation.proposal.pragmatist',
    label: 'Pragmatist Proposal',
    description: 'Pragmatist agent generating proposals',
    category: 'deliberation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },
  'deliberation.proposal.performance': {
    key: 'deliberation.proposal.performance',
    label: 'Performance Proposal',
    description: 'Performance engineer agent generating proposals',
    category: 'deliberation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },

  // Deliberation system — debate, vote, synthesis
  'deliberation.debate': {
    key: 'deliberation.debate',
    label: 'Debate Rounds',
    description: 'Agent debate responses during deliberation',
    category: 'deliberation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 2048,
  },
  'deliberation.vote': {
    key: 'deliberation.vote',
    label: 'Voting',
    description: 'Agent vote casting and reasoning',
    category: 'deliberation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 1024,
  },
  'deliberation.synthesis': {
    key: 'deliberation.synthesis',
    label: 'Final Synthesis',
    description: 'Synthesize winning proposal into implementation plan',
    category: 'deliberation',
    defaultModel: 'claude-opus-4-6',
    defaultTemperature: 0.5,
    defaultMaxTokens: 4096,
  },
  'deliberation.management-summary': {
    key: 'deliberation.management-summary',
    label: 'Management Summary',
    description: 'Generate concise executive summary from deliberation synthesis',
    category: 'deliberation',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 1024,
  },

  // Planning
  'planning.propose': {
    key: 'planning.propose',
    label: 'AI Propose Epics',
    description: 'Propose epics and stories from backlog analysis',
    category: 'planning',
    defaultModel: 'claude-opus-4-6',
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
  },
  'planning.enhance': {
    key: 'planning.enhance',
    label: 'Enhance Issue',
    description: 'Enhance GitHub issue descriptions and acceptance criteria',
    category: 'planning',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.5,
    defaultMaxTokens: 2048,
  },

  // Reports
  'reports.generate': {
    key: 'reports.generate',
    label: 'Generate Summary',
    description: 'Auto-generate implementation report summaries from PRs',
    category: 'reports',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 1024,
  },

  // Issues
  'issues.create-from-review': {
    key: 'issues.create-from-review',
    label: 'Extract From Review',
    description: 'Extract findings from architecture review into GitHub issues',
    category: 'issues',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 2048,
  },

  // CI / Code Review
  // Agent Loop
  'agent-loop.iterate': {
    key: 'agent-loop.iterate',
    label: 'Agent Loop Iteration',
    description: 'Iterative AI coding loop — think/act/observe cycles',
    category: 'agent',
    defaultModel: 'claude-sonnet-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 8192,
  },

  // CI / Code Review
  'pr.code-review': {
    key: 'pr.code-review',
    label: 'PR Code Review',
    description: 'AI code review on pull requests (CI pipeline)',
    category: 'ci',
    defaultModel: 'claude-opus-4-6',
    defaultTemperature: 0.3,
    defaultMaxTokens: 4096,
  },
};

export type AIActivityKey = keyof typeof AI_ACTIVITIES;

export function getActivityCategories(): { category: string; activities: AIActivityDef[] }[] {
  const grouped = new Map<string, AIActivityDef[]>();
  for (const activity of Object.values(AI_ACTIVITIES)) {
    const list = grouped.get(activity.category) || [];
    list.push(activity);
    grouped.set(activity.category, list);
  }
  return Array.from(grouped.entries()).map(([category, activities]) => ({ category, activities }));
}
