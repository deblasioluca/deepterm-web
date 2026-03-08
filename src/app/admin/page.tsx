'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock,
  DollarSign,
  ExternalLink,
  GitBranch,
  Loader2,
  Monitor,
  Package,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useAdminAI } from '@/components/admin/AdminAIContext';

/* ---------- types ---------- */

interface LifecycleStory {
  id: string;
  title: string;
  status: string;
  priority: string;
  lifecycleStep: string | null;
  agentLoop: {
    id: string;
    status: string;
    totalIterations: number;
    maxIterations: number;
    prNumber: number | null;
    prUrl: string | null;
  } | null;
  testProgress: {
    buildPass: boolean | null;
    unitPass: boolean | null;
    e2ePass: boolean | null;
  } | null;
}

interface CiBuild {
  id: string;
  repo: string;
  branch: string;
  workflow: string;
  conclusion: string | null;
  commitMessage: string | null;
  duration: number | null;
  url: string | null;
  triggeredAt: string;
}

interface AgentLoop {
  id: string;
  status: string;
  storyId: string | null;
  totalIterations: number;
  maxIterations: number;
  costCents: number;
  startedAt: string;
  story: { title: string } | null;
  config: { name: string; model: string } | null;
}

interface AiUsageSummary {
  totals: {
    calls: number;
    costDollars: number;
    costCents: number;
    totalTokens: number;
    errorCount: number;
  };
}

interface Release {
  id: string;
  platform: string;
  version: string;
  releaseNotes: string | null;
  sizeBytes: number | null;
  publishedAt: string | null;
  createdAt: string;
}

interface CockpitData {
  health: { ciMac: { status: string; busy?: boolean } };
  builds: CiBuild[];
  stats: {
    issues: { open: number; total: number };
    releases: { total: number; latest: string | null };
  };
  githubIssues: { open: number };
  triageQueue: {
    issues: Array<{ id: string; title: string; area: string; status: string; createdAt: string }>;
    ideas: Array<{ id: string; title: string; status: string; votes: number; createdAt: string }>;
  };
}

/* ---------- helpers ---------- */

const stepLabel: Record<string, string> = {
  deliberation: 'Deliberation',
  implementation: 'Implementation',
  ci_test: 'CI Testing',
  pr_review: 'PR Review',
  deploy: 'Deploy',
  done: 'Done',
};

function ciColor(conclusion: string | null): string {
  if (!conclusion) return 'text-text-tertiary';
  if (conclusion === 'success') return 'text-green-500';
  if (conclusion === 'failure') return 'text-red-500';
  return 'text-amber-500';
}

function ciBadgeColor(conclusion: string | null): string {
  if (!conclusion) return 'bg-text-tertiary/20 text-text-tertiary';
  if (conclusion === 'success') return 'bg-green-500/20 text-green-400';
  if (conclusion === 'failure') return 'bg-red-500/20 text-red-400';
  return 'bg-amber-500/20 text-amber-400';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ---------- component ---------- */

export default function AdminDashboard() {
  const [lifecycleStories, setLifecycleStories] = useState<LifecycleStory[]>([]);
  const [cockpit, setCockpit] = useState<CockpitData | null>(null);
  const [aiUsage, setAiUsage] = useState<AiUsageSummary | null>(null);
  const [agentLoops, setAgentLoops] = useState<AgentLoop[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const { setPageContext } = useAdminAI();

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cockpitRes, aiRes, agentRes, lifecycleRes, releasesRes] = await Promise.all([
        fetch('/api/admin/cockpit').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/admin/cockpit/ai-usage/summary?period=today').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/admin/cockpit/agent-loop?status=running').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/admin/cockpit/lifecycle').then(r => r.ok ? r.json() : null).catch(() => null),
        fetch('/api/admin/releases').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (cockpitRes) setCockpit(cockpitRes);
      if (aiRes) setAiUsage(aiRes);
      if (agentRes) setAgentLoops(agentRes.loops || []);
      if (lifecycleRes) {
        const stories: LifecycleStory[] = (lifecycleRes.stories || lifecycleRes || [])
          .filter((s: LifecycleStory) => s.status === 'in_progress' || s.lifecycleStep);
        setLifecycleStories(stories.slice(0, 8));
      }
      if (releasesRes) setReleases((releasesRes.releases || []).slice(0, 5));
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Dashboard fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const interval = setInterval(fetchAll, 60000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  useEffect(() => {
    setPageContext({
      page: 'Command Center',
      summary: 'Operational overview — active stories, CI, AI cost, issues, agents',
      data: {
        activeStories: lifecycleStories.length,
        runningAgents: agentLoops.length,
        openIssues: cockpit?.stats?.issues?.open ?? 0,
        todayAiCost: aiUsage?.totals?.costDollars ?? 0,
        ciMacStatus: cockpit?.health?.ciMac?.status ?? 'unknown',
      },
    });
    return () => setPageContext(null);
  }, [lifecycleStories, agentLoops, cockpit, aiUsage, setPageContext]);

  const openIssues = (cockpit?.stats?.issues?.open ?? 0) + (cockpit?.githubIssues?.open ?? 0);
  const ciStatus = cockpit?.health?.ciMac?.status ?? 'unknown';
  const todayCost = aiUsage?.totals?.costDollars ?? 0;
  const todayCalls = aiUsage?.totals?.calls ?? 0;
  const recentBuilds = (cockpit?.builds || []).slice(0, 6);

  /* ---------- stat cards ---------- */
  const statCards = [
    {
      title: 'Active Stories',
      value: lifecycleStories.length,
      sub: lifecycleStories.filter(s => s.agentLoop?.status === 'running').length + ' with agent',
      icon: CircleDot,
      href: '/admin/cockpit',
      color: 'text-accent-primary',
      bgColor: 'bg-accent-primary/10',
    },
    {
      title: 'Open Issues',
      value: openIssues,
      sub: `${cockpit?.stats?.issues?.open ?? 0} user · ${cockpit?.githubIssues?.open ?? 0} GitHub`,
      icon: AlertCircle,
      href: '/admin/issues',
      color: openIssues > 5 ? 'text-red-500' : 'text-amber-500',
      bgColor: openIssues > 5 ? 'bg-red-500/10' : 'bg-amber-500/10',
    },
    {
      title: "Today's AI Cost",
      value: `$${todayCost.toFixed(2)}`,
      sub: `${todayCalls} calls`,
      icon: DollarSign,
      href: '/admin/cockpit',
      color: todayCost > 5 ? 'text-red-500' : 'text-green-500',
      bgColor: todayCost > 5 ? 'bg-red-500/10' : 'bg-green-500/10',
    },
    {
      title: 'CI Mac',
      value: ciStatus === 'online' ? 'Online' : ciStatus === 'offline' ? 'Offline' : 'Unknown',
      sub: cockpit?.health?.ciMac?.busy ? 'Busy' : 'Idle',
      icon: Monitor,
      href: '/admin/cockpit',
      color: ciStatus === 'online' ? 'text-green-500' : ciStatus === 'offline' ? 'text-red-500' : 'text-text-tertiary',
      bgColor: ciStatus === 'online' ? 'bg-green-500/10' : ciStatus === 'offline' ? 'bg-red-500/10' : 'bg-white/5',
    },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Command Center
            </h1>
            <p className="text-text-secondary">
              Operational overview — last refreshed {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <button
            onClick={fetchAll}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={stat.href}>
                  <Card hover className="relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-text-secondary mb-1">{stat.title}</p>
                        <p className="text-2xl font-bold text-text-primary">
                          {isLoading ? '...' : stat.value}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          {isLoading ? '' : stat.sub}
                        </p>
                      </div>
                      <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                        <Icon className={`w-6 h-6 ${stat.color}`} />
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Main content: two columns */}
        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          {/* Active Lifecycle Stories */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Active Stories</h2>
              <Link href="/admin/cockpit" className="text-sm text-accent-primary hover:underline">
                Cockpit →
              </Link>
            </div>
            <div className="space-y-3">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
                </div>
              ) : lifecycleStories.length > 0 ? (
                lifecycleStories.map((story) => (
                  <div key={story.id} className="p-3 rounded-lg bg-background-tertiary">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-text-primary text-sm truncate">
                          {story.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {story.lifecycleStep && (
                            <span className="text-xs px-2 py-0.5 rounded bg-accent-primary/20 text-accent-primary">
                              {stepLabel[story.lifecycleStep] || story.lifecycleStep}
                            </span>
                          )}
                          {story.agentLoop && (
                            <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${
                              story.agentLoop.status === 'running'
                                ? 'bg-green-500/20 text-green-400'
                                : story.agentLoop.status === 'failed'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-white/10 text-text-tertiary'
                            }`}>
                              <Bot className="w-3 h-3" />
                              {story.agentLoop.status} ({story.agentLoop.totalIterations}/{story.agentLoop.maxIterations})
                            </span>
                          )}
                          {story.testProgress && (
                            <span className="text-xs flex items-center gap-1 text-text-tertiary">
                              {story.testProgress.buildPass === true && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                              {story.testProgress.buildPass === false && <XCircle className="w-3 h-3 text-red-500" />}
                              {story.testProgress.e2ePass === true && <span className="text-green-500">e2e✓</span>}
                            </span>
                          )}
                        </div>
                      </div>
                      {story.agentLoop?.prUrl && (
                        <a
                          href={story.agentLoop.prUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-tertiary hover:text-accent-primary flex-shrink-0"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-text-secondary py-8">No active stories</p>
              )}
            </div>
          </Card>

          {/* Right column: CI Builds + Agent Loops */}
          <div className="space-y-6">
            {/* Recent CI Builds */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary">Recent Builds</h2>
                <Link href="/admin/cockpit" className="text-sm text-accent-primary hover:underline">
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                  </div>
                ) : recentBuilds.length > 0 ? (
                  recentBuilds.map((build) => (
                    <div key={build.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                          build.conclusion === 'success' ? 'bg-green-500' :
                          build.conclusion === 'failure' ? 'bg-red-500' :
                          'bg-amber-500 animate-pulse'
                        }`} />
                        <span className="text-text-primary truncate">
                          {build.commitMessage || build.workflow}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${ciBadgeColor(build.conclusion)}`}>
                          {build.conclusion || 'running'}
                        </span>
                        <span className="text-xs text-text-tertiary">{timeAgo(build.triggeredAt)}</span>
                        {build.url && (
                          <a href={build.url} target="_blank" rel="noopener noreferrer" className="text-text-tertiary hover:text-accent-primary">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-text-secondary py-4 text-sm">No recent builds</p>
                )}
              </div>
            </Card>

            {/* Running Agent Loops */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                  <Bot className="w-5 h-5 text-accent-primary" />
                  Running Agents
                </h2>
                <span className="text-sm text-text-tertiary">{agentLoops.length} active</span>
              </div>
              <div className="space-y-2">
                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                  </div>
                ) : agentLoops.length > 0 ? (
                  agentLoops.map((loop) => (
                    <div key={loop.id} className="p-2 rounded bg-background-tertiary text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-text-primary font-medium truncate">
                          {loop.story?.title || loop.config?.name || 'Agent'}
                        </span>
                        <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">
                          {loop.totalIterations}/{loop.maxIterations} iters
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-text-tertiary">{loop.config?.model}</span>
                        <span className="text-xs text-text-tertiary">·</span>
                        <span className="text-xs text-text-tertiary">${(loop.costCents / 100).toFixed(2)}</span>
                        <span className="text-xs text-text-tertiary">·</span>
                        <span className="text-xs text-text-tertiary">{timeAgo(loop.startedAt)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-center text-text-secondary py-4 text-sm">No agents running</p>
                )}
              </div>
            </Card>
          </div>
        </div>

        {/* Bottom row: Releases + Triage Queue */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Releases */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Package className="w-5 h-5 text-accent-secondary" />
                Recent Releases
              </h2>
              <Link href="/admin/settings?tab=releases" className="text-sm text-accent-primary hover:underline">
                Manage →
              </Link>
            </div>
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                </div>
              ) : releases.length > 0 ? (
                releases.map((rel) => (
                  <div key={rel.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium">v{rel.version}</span>
                      <span className="text-xs text-text-tertiary">{rel.platform}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {rel.sizeBytes && (
                        <span className="text-xs text-text-tertiary">
                          {(rel.sizeBytes / 1048576).toFixed(1)} MB
                        </span>
                      )}
                      <span className="text-xs text-text-tertiary">
                        {timeAgo(rel.publishedAt || rel.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center text-text-secondary py-4 text-sm">No releases</p>
              )}
            </div>
          </Card>

          {/* Triage Queue */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary">Triage Queue</h2>
              <Link href="/admin/cockpit" className="text-sm text-accent-primary hover:underline">
                Cockpit →
              </Link>
            </div>
            <div className="space-y-2">
              {isLoading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                </div>
              ) : (cockpit?.triageQueue?.issues?.length || cockpit?.triageQueue?.ideas?.length) ? (
                <>
                  {cockpit?.triageQueue?.issues?.slice(0, 3).map((issue) => (
                    <div key={issue.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                        <span className="text-text-primary truncate">{issue.title}</span>
                      </div>
                      <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">{issue.area}</span>
                    </div>
                  ))}
                  {cockpit?.triageQueue?.ideas?.slice(0, 3).map((idea) => (
                    <div key={idea.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <CircleDot className="w-3.5 h-3.5 text-accent-primary flex-shrink-0" />
                        <span className="text-text-primary truncate">{idea.title}</span>
                      </div>
                      <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">{idea.votes} votes</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-center text-text-secondary py-4 text-sm">Queue empty — all clear!</p>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
