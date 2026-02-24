'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  Server,
  Cpu,
  Radio,
  GitBranch,
  GitPullRequest,
  GitCommit,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  RefreshCw,
  Bug,
  Lightbulb,
  Package,
  Users,
  Loader2,
  ExternalLink,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  Tag,
  CircleDot,
} from 'lucide-react';

interface HealthData {
  pi: { status: string; uptimeSeconds: number; memoryMB: number; heapMB: number };
  nodeRed: { status: string };
  ciMac: { status: string };
}

interface CiBuild {
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

interface GithubEvent {
  id: string;
  eventType: string;
  repo: string;
  branch: string | null;
  actor: string | null;
  summary: string | null;
  url: string | null;
  createdAt: string;
}

interface QuickStats {
  issues: { total: number; open: number };
  ideas: number;
  releases: { total: number; latest: string };
  users: number;
}

interface GithubLabel {
  name: string;
  color: string;
}

interface GithubIssue {
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

interface GithubIssuesData {
  open: number;
  closed: number;
  items: GithubIssue[];
}

interface CockpitData {
  health: HealthData;
  builds: CiBuild[];
  events: GithubEvent[];
  stats: QuickStats;
  githubIssues: GithubIssuesData;
  timestamp: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    online: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    offline: 'bg-red-500/20 text-red-400 border-red-500/30',
    degraded: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    unknown: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] || colors.unknown}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-emerald-400 animate-pulse' : status === 'offline' ? 'bg-red-400' : 'bg-zinc-400'}`} />
      {status}
    </span>
  );
}

function ConclusionBadge({ conclusion }: { conclusion: string | null }) {
  if (!conclusion) return <span className="text-zinc-500 text-xs">running…</span>;
  const map: Record<string, { icon: typeof CheckCircle2; cls: string }> = {
    success: { icon: CheckCircle2, cls: 'text-emerald-400' },
    failure: { icon: XCircle, cls: 'text-red-400' },
    cancelled: { icon: AlertTriangle, cls: 'text-amber-400' },
  };
  const cfg = map[conclusion] || map.cancelled;
  const Icon = cfg.icon;
  return <Icon className={`w-4 h-4 ${cfg.cls}`} />;
}

function EventIcon({ type }: { type: string }) {
  if (type === 'push') return <GitCommit className="w-4 h-4 text-blue-400" />;
  if (type === 'pull_request') return <GitPullRequest className="w-4 h-4 text-purple-400" />;
  if (type === 'workflow_run') return <Activity className="w-4 h-4 text-amber-400" />;
  return <GitBranch className="w-4 h-4 text-zinc-400" />;
}

function LabelBadge({ label }: { label: GithubLabel }) {
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border"
      style={{
        backgroundColor: `#${label.color}20`,
        borderColor: `#${label.color}40`,
        color: `#${label.color}`,
      }}
    >
      {label.name}
    </span>
  );
}

export default function CockpitPage() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [issueFilter, setIssueFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { health, builds, events, stats, githubIssues } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cockpit</h1>
          <p className="text-sm text-zinc-400 mt-1">System overview &amp; operations</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              autoRefresh ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {autoRefresh ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          {data.timestamp && (
            <span className="text-xs text-zinc-500">
              Updated {formatTimeAgo(data.timestamp)}
            </span>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Bug className="w-3.5 h-3.5" /> Issues
          </div>
          <div className="text-2xl font-bold text-white">{stats.issues.open}</div>
          <div className="text-xs text-zinc-500 mt-1">open of {stats.issues.total}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Lightbulb className="w-3.5 h-3.5" /> Ideas
          </div>
          <div className="text-2xl font-bold text-white">{stats.ideas}</div>
          <div className="text-xs text-zinc-500 mt-1">submitted</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Package className="w-3.5 h-3.5" /> Releases
          </div>
          <div className="text-2xl font-bold text-white">{stats.releases.total}</div>
          <div className="text-xs text-zinc-500 mt-1">latest: {stats.releases.latest}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Users className="w-3.5 h-3.5" /> Users
          </div>
          <div className="text-2xl font-bold text-white">{stats.users}</div>
          <div className="text-xs text-zinc-500 mt-1">registered</div>
        </div>
      </div>

      {/* GitHub Issues */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <CircleDot className="w-4 h-4 text-green-400" /> GitHub Issues
            <span className="text-xs font-normal text-zinc-500 ml-1">
              {githubIssues.open} open · {githubIssues.closed} recently closed
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex bg-zinc-800 rounded-lg border border-zinc-700 p-0.5">
              {(['open', 'closed', 'all'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setIssueFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                    issueFilter === f
                      ? 'bg-zinc-700 text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => setIssuesExpanded(!issuesExpanded)}
              className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-300 transition"
            >
              {issuesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {issuesExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>

        {(() => {
          const filtered = githubIssues.items.filter((i) =>
            issueFilter === 'all' ? true : i.state === issueFilter
          );
          const displayed = issuesExpanded ? filtered : filtered.slice(0, 8);

          if (filtered.length === 0) {
            return <p className="text-zinc-500 text-sm">No {issueFilter} issues found.</p>;
          }

          return (
            <div className="space-y-1.5">
              {displayed.map((issue) => (
                <div
                  key={issue.number}
                  className="flex items-start gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30 hover:bg-zinc-800/60 transition"
                >
                  <div className="mt-0.5">
                    {issue.state === 'open' ? (
                      <CircleDot className="w-4 h-4 text-green-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-purple-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-zinc-200 hover:text-white transition font-medium truncate"
                      >
                        #{issue.number} {issue.title}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {issue.labels.map((label) => (
                        <LabelBadge key={label.name} label={label} />
                      ))}
                      {issue.milestone && (
                        <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                          <Tag className="w-2.5 h-2.5" /> {issue.milestone}
                        </span>
                      )}
                      {issue.assignee && (
                        <span className="text-[10px] text-zinc-500">
                          → {issue.assignee}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs text-zinc-500">{formatTimeAgo(issue.updatedAt)}</span>
                  </div>
                </div>
              ))}
              {!issuesExpanded && filtered.length > 8 && (
                <button
                  onClick={() => setIssuesExpanded(true)}
                  className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
                >
                  Show all {filtered.length} issues...
                </button>
              )}
            </div>
          );
        })()}
      </div>

      {/* System Health */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" /> System Health
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pi */}
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-zinc-200">Raspberry Pi</span>
              </div>
              <StatusBadge status={health.pi.status} />
            </div>
            <div className="space-y-1.5 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Uptime</span>
                <span className="text-zinc-300">{formatUptime(health.pi.uptimeSeconds)}</span>
              </div>
              <div className="flex justify-between">
                <span>Memory (RSS)</span>
                <span className="text-zinc-300">{health.pi.memoryMB} MB</span>
              </div>
              <div className="flex justify-between">
                <span>Heap Used</span>
                <span className="text-zinc-300">{health.pi.heapMB} MB</span>
              </div>
            </div>
          </div>

          {/* CI Mac */}
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-zinc-200">CI Mac</span>
              </div>
              <StatusBadge status={health.ciMac.status} />
            </div>
            <div className="space-y-1.5 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Runner</span>
                <span className="text-zinc-300">self-hosted-mac</span>
              </div>
              <div className="flex justify-between">
                <span>Last build</span>
                <span className="text-zinc-300">
                  {builds.length > 0 ? formatTimeAgo(builds[0].createdAt) : 'none'}
                </span>
              </div>
            </div>
          </div>

          {/* Node-RED */}
          <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-zinc-200">Node-RED</span>
              </div>
              <StatusBadge status={health.nodeRed.status} />
            </div>
            <div className="space-y-1.5 text-xs text-zinc-400">
              <div className="flex justify-between">
                <span>Address</span>
                <span className="text-zinc-300">192.168.1.30:1880</span>
              </div>
              <div className="flex justify-between">
                <span>Flows</span>
                <span className="text-zinc-300">WhatsApp + DeepTerm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Two column: Builds + Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CI Builds */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-purple-400" /> Recent CI Builds
          </h2>
          {builds.length === 0 ? (
            <p className="text-zinc-500 text-sm">No builds recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {builds.map((build) => (
                <div key={build.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                  <ConclusionBadge conclusion={build.conclusion} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 truncate">
                      {build.commitMessage || build.workflow}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {build.branch} · {build.workflow}
                      {build.duration ? ` · ${build.duration}s` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{formatTimeAgo(build.createdAt)}</span>
                    {build.url && (
                      <a href={build.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GitHub Events */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-blue-400" /> GitHub Activity
          </h2>
          {events.length === 0 ? (
            <p className="text-zinc-500 text-sm">No events recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                  <EventIcon type={event.eventType} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 truncate">
                      {event.summary || `${event.eventType} on ${event.repo}`}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {event.actor && `${event.actor} · `}{event.branch || event.repo}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-500">{formatTimeAgo(event.createdAt)}</span>
                    {event.url && (
                      <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
