'use client';

import { useState } from 'react';
import {
  Workflow,
  ExternalLink,
  AlertTriangle,
  Play,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Pause,
  ChevronDown,
  ChevronRight,
  Settings,
} from 'lucide-react';
import type { PipelineData, PipelineRun, PipelineTask, RunAction } from '../types';
import { formatTimeAgo } from '../utils';

interface PipelinesTabProps {
  pipelines?: PipelineData;
  runAction: RunAction;
  actionLoading: string | null;
}

const STATE_STYLES: Record<string, { color: string; bg: string; icon: typeof CheckCircle2; animate?: boolean }> = {
  success: { color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: CheckCircle2 },
  failed: { color: 'text-red-400', bg: 'bg-red-500/20', icon: XCircle },
  running: { color: 'text-amber-400', bg: 'bg-amber-500/20', icon: Loader2, animate: true },
  queued: { color: 'text-blue-400', bg: 'bg-blue-500/20', icon: Clock },
  upstream_failed: { color: 'text-orange-400', bg: 'bg-orange-500/20', icon: AlertTriangle },
  skipped: { color: 'text-zinc-500', bg: 'bg-zinc-500/20', icon: Pause },
  no_status: { color: 'text-zinc-500', bg: 'bg-zinc-500/20', icon: Clock },
};

function StateBadge({ state }: { state: string }) {
  const style = STATE_STYLES[state] || STATE_STYLES.no_status;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.color}`}>
      <Icon className={`w-3 h-3 ${style.animate ? 'animate-spin' : ''}`} />
      {state}
    </span>
  );
}

function formatDuration(startDate: string | null, endDate: string | null): string {
  if (!startDate) return '-';
  const start = new Date(startDate).getTime();
  const end = endDate ? new Date(endDate).getTime() : Date.now();
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function RunRow({ run, onTrigger }: { run: PipelineRun; onTrigger?: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [tasks, setTasks] = useState<PipelineTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (tasks.length > 0) return;

    try {
      setLoadingTasks(true);
      const res = await fetch(
        `/api/admin/cockpit/pipelines/runs/${encodeURIComponent(run.dagId)}/${encodeURIComponent(run.runId)}`
      );
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch { /* ok */ } finally {
      setLoadingTasks(false);
    }
  };

  return (
    <>
      <tr
        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition"
        onClick={toggleExpand}
      >
        <td className="py-2.5 px-3">
          <button className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="py-2.5 px-3">
          <span className="text-sm text-text-primary font-medium">{run.dagId}</span>
        </td>
        <td className="py-2.5 px-3">
          <span className="text-xs text-zinc-500 font-mono">{run.runId.length > 30 ? `${run.runId.slice(0, 30)}...` : run.runId}</span>
        </td>
        <td className="py-2.5 px-3">
          <StateBadge state={run.state} />
        </td>
        <td className="py-2.5 px-3 text-xs text-zinc-400">
          {run.startDate ? formatTimeAgo(run.startDate) : '-'}
        </td>
        <td className="py-2.5 px-3 text-xs text-zinc-400">
          {formatDuration(run.startDate, run.endDate)}
        </td>
        <td className="py-2.5 px-3">
          {onTrigger && (
            <button
              onClick={e => { e.stopPropagation(); onTrigger(); }}
              className="text-xs text-accent-primary hover:text-accent-primary-hover"
            >
              Re-run
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-zinc-900/50 px-6 py-3">
            {loadingTasks ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading tasks...
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-xs text-zinc-500">No task instances found</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {tasks.map(t => (
                  <div key={t.taskId} className="flex items-center justify-between px-3 py-2 bg-zinc-800/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <StateBadge state={t.state} />
                      <span className="text-xs text-zinc-300 font-mono">{t.taskId}</span>
                    </div>
                    <span className="text-xs text-zinc-500">
                      {t.duration != null ? `${t.duration}s` : '-'}
                      {t.tryNumber > 1 && ` (try ${t.tryNumber})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export default function PipelinesTab({ pipelines, runAction, actionLoading }: PipelinesTabProps) {
  const [triggeringDag, setTriggeringDag] = useState<string | null>(null);

  const triggerDag = async (dagId: string) => {
    setTriggeringDag(dagId);
    await runAction('trigger-dag', { dagId });
    setTriggeringDag(null);
  };

  if (!pipelines) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
        <Workflow className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
        <p className="text-zinc-400">Pipeline data not available</p>
        <p className="text-xs text-zinc-600 mt-1">Airflow is not configured or unreachable</p>
      </div>
    );
  }

  if (!pipelines.connected) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Workflow className="w-5 h-5 text-amber-400" />
            Pipeline Orchestration
          </h2>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Airflow Not Connected</p>
            <p className="text-sm text-zinc-400 mt-1">
              {pipelines.errorMessage || 'Configure Airflow credentials in Settings > Integrations to enable pipeline monitoring.'}
            </p>
            <a
              href="/admin/settings"
              className="inline-flex items-center gap-1 mt-2 text-xs text-accent-primary hover:text-accent-primary-hover"
            >
              <Settings className="w-3 h-3" /> Go to Settings
            </a>
          </div>
        </div>
      </div>
    );
  }

  const scheduledDags = pipelines.dags.filter(d => !d.isPaused && d.schedule);
  const pausedDags = pipelines.dags.filter(d => d.isPaused);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Workflow className="w-5 h-5 text-amber-400" />
          Pipeline Orchestration
        </h2>
        <a
          href={pipelines.dags.length > 0 ? undefined : '#'}
          onClick={() => {
            // Use the URL from the first DAG's config or fall back
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
        >
          <ExternalLink className="w-3 h-3" />
          Open Airflow UI
        </a>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Total DAGs</p>
          <p className="text-2xl font-bold text-white mt-1">{pipelines.dags.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Active Runs</p>
          <p className="text-2xl font-bold text-amber-400 mt-1">{pipelines.activeRuns.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Scheduled</p>
          <p className="text-2xl font-bold text-blue-400 mt-1">{scheduledDags.length}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500">Paused</p>
          <p className="text-2xl font-bold text-zinc-500 mt-1">{pausedDags.length}</p>
        </div>
      </div>

      {/* Active Runs */}
      {pipelines.activeRuns.length > 0 && (
        <div className="bg-zinc-900 border border-amber-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
            <h3 className="text-sm font-semibold text-white">Active Runs</h3>
            <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">{pipelines.activeRuns.length}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-2 px-3 w-8" />
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">DAG</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Run ID</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">State</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Started</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Duration</th>
                  <th className="py-2 px-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {pipelines.activeRuns.map(run => (
                  <RunRow key={run.runId} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Runs */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
        </div>
        {pipelines.recentRuns.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">No recent runs</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="py-2 px-3 w-8" />
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">DAG</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Run ID</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">State</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Started</th>
                  <th className="py-2 px-3 text-xs text-zinc-500 font-medium">Duration</th>
                  <th className="py-2 px-3 w-16" />
                </tr>
              </thead>
              <tbody>
                {pipelines.recentRuns.map(run => (
                  <RunRow
                    key={run.runId}
                    run={run}
                    onTrigger={() => triggerDag(run.dagId)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scheduled DAGs */}
      {scheduledDags.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-white">Scheduled DAGs</h3>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {scheduledDags.map(dag => (
              <div key={dag.dagId} className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary font-medium truncate">{dag.dagId}</span>
                    {dag.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {dag.description && (
                    <p className="text-xs text-zinc-500 mt-0.5 truncate">{dag.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-zinc-500">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {dag.schedule}
                    </span>
                    {dag.nextRun && (
                      <span className="text-xs text-zinc-500">
                        Next: {new Date(dag.nextRun).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => triggerDag(dag.dagId)}
                  disabled={actionLoading !== null || triggeringDag === dag.dagId}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50"
                >
                  {triggeringDag === dag.dagId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3 text-emerald-400" />
                  )}
                  Trigger
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All DAGs list */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">All DAGs ({pipelines.dags.length})</h3>
        </div>
        <div className="divide-y divide-zinc-800/50">
          {pipelines.dags.map(dag => (
            <div key={dag.dagId} className="px-4 py-2.5 flex items-center justify-between hover:bg-zinc-800/30 transition">
              <div className="flex items-center gap-2 min-w-0">
                {dag.isPaused ? (
                  <Pause className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                ) : (
                  <Play className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                )}
                <span className={`text-sm truncate ${dag.isPaused ? 'text-zinc-500' : 'text-text-primary'}`}>
                  {dag.dagId}
                </span>
                {dag.tags.map(tag => (
                  <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {dag.schedule && (
                  <span className="text-xs text-zinc-500">{dag.schedule}</span>
                )}
                <button
                  onClick={() => triggerDag(dag.dagId)}
                  disabled={actionLoading !== null || dag.isPaused || triggeringDag === dag.dagId}
                  className="flex items-center gap-1 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-xs text-zinc-300 hover:bg-zinc-700 transition disabled:opacity-50"
                >
                  {triggeringDag === dag.dagId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Run
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
