'use client';

import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GitCommit,
  GitPullRequest,
  GitBranch,
  Activity,
} from 'lucide-react';
import type { GithubLabel } from '../types';

export function StatusBadge({ status }: { status: string }) {
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

export function ConclusionBadge({ conclusion }: { conclusion: string | null }) {
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

export function EventIcon({ type }: { type: string }) {
  if (type === 'push') return <GitCommit className="w-4 h-4 text-blue-400" />;
  if (type === 'pull_request') return <GitPullRequest className="w-4 h-4 text-purple-400" />;
  if (type === 'workflow_run') return <Activity className="w-4 h-4 text-amber-400" />;
  return <GitBranch className="w-4 h-4 text-zinc-400" />;
}

export function LabelBadge({ label }: { label: GithubLabel }) {
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

export function PriorityBadge({ priority }: { priority: string }) {
  const colors: Record<string, string> = {
    critical: 'bg-red-500/20 text-red-400 border-red-500/30',
    high: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[priority] || colors.medium}`}>
      {priority}
    </span>
  );
}

export function WorkflowStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    backlog: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    planned: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    in_progress: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    done: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    released: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  };
  const labels: Record<string, string> = {
    backlog: 'backlog',
    planned: 'planned',
    in_progress: 'in progress',
    done: 'done',
    released: 'released',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${colors[status] || colors.backlog}`}>
      {labels[status] || status}
    </span>
  );
}
