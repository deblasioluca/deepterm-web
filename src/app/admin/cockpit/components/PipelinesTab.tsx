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
  LayoutDashboard,
  Calendar,
  List,
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

type SubTab = 'overview' | 'scheduled' | 'all';

const SUB_TABS: { key: SubTab; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'overview', label: 'Overview & Runs', icon: LayoutDashboard },
  { key: 'scheduled', label: 'Scheduled DAGs', icon: Calendar },
  { key: 'all', label: 'All DAGs', icon: List },
];

// Implementation-related tags — DAGs without these tags are hidden from Overview & Scheduled
const IMPLEMENTATION_TAGS = new Set(['deepterm', 'implementation', 'lifecycle', 'ci', 'cd', 'deploy', 'release', 'build', 'test', 'review']);

function isImplementationDag(dag: { tags: string[] }): boolean {
  // Show all DAGs if none are tagged (Airflow not yet configured with tags)
  if (!dag.tags || dag.tags.length === 0) return true;
  return dag.tags.some(t => IMPLEMENTATION_TAGS.has(t.toLowerCase()));
}

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
  const [effectiveState, setEffectiveState] = useState<string | null>(null);

  const toggleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (tasks.length > 0) return;
    try {
      setLoadingTasks(true);
      const res = await fetch(`/api/admin/cockpit/pipelines/runs/${encodeURIComponent(run.dagId)}/${encodeURIComponent(run.runId)}`);
      if (res.ok) {
        const data = await res.json();
        const loadedTasks: PipelineTask[] = data.tasks || [];
        setTasks(loadedTasks);
        if (run.state === 'success' && loadedTasks.length > 0) {
          const hasFailed = loadedTasks.some(t => t.state === 'failed');
          const hasUpstreamFailed = loadedTasks.some(t => t.state === 'upstream_failed');
          if (hasFailed) setEffectiveState('failed');
          else if (hasUpstreamFailed) setEffectiveState('upstream_failed');
        }
      }
    } catch { /* ok */ } finally { setLoadingTasks(false); }
  };

  const displayState = effectiveState || run.state;
  const showOverridden = (effectiveState && effectiveState !== run.state) || run.stateOverridden;

  return (
    <>
      <tr className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer transition" onClick={toggleExpand}>
        <td className="py-2.5 px-3">
          <button className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </td>
        <td className="py-2.5 px-3"><span className="text-sm text-text-primary font-medium">{run.dagId}</span></td>
        <td className="py-2.5 px-3"><span className="text-xs text-zinc-500 font-mono">{run.runId.length > 30 ? `${run.runId.slice(0, 30)}...` : run.runId}</span></td>
        <td className="py-2.5 px-3">
          <div className="flex items-center gap-1.5">
            <StateBadge state={displayState} />
            {showOverridden && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/10 text-red-400 border border-red-500/20" title={`Airflow reported "${run.airflowState || 'success'}" but tasks show failures`}>
                <AlertTriangle className="w-2.5 h-2.5" /> overridden
              </span>
            )}
          </div>
        </td>
        <td className="py-2.5 px-3 text-xs text-zinc-400">{run.startDate ? formatTimeAgo(run.startDate) : '-'}</td>
        <td className="py-2.5 px-3 text-xs text-zinc-400">{formatDuration(run.startDate, run.endDate)}</td>
        <td className="py-2.5 px-3">
          {onTrigger && (
            <button onClick={e => { e.stopPropagation(); onTrigger(); }} className="text-xs text-accent-primary hover:text-accent-primary-hover">Re-run</button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="bg-zinc-900/50 px-6 py-3">
            {loadingTasks ? (
              <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <p className="text-xs text-zinc-500">No task instances found</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1 flex-wrap py-2">
                  {tasks.sort((a, b) => {
                    if (a.startDate && b.startDate) return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
                    if (a.startDate) return -1; if (b.startDate) return 1;
                    return a.taskId.localeCompare(b.taskId);
                  }).map((t, idx, arr) => {
                    const st = STATE_STYLES[t.state] || STATE_STYLES.no_status;
                    const Icon = st.icon;
                    return (
                      <div key={t.taskId} className="flex items-center gap-1">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${st.bg} ${st.color} border-current/20`} title={`${t.taskId}: ${t.state}${t.duration != null ? ` (${t.duration}s)` : ''}${t.tryNumber > 1 ? ` — try ${t.tryNumber}` : ''}`}>
                          <Icon className={`w-3.5 h-3.5 ${st.animate ? 'animate-spin' : ''}`} />
                          <span className="text-xs font-medium truncate max-w-[140px]">{t.taskId}</span>
                          {t.duration != null && <span className="text-[10px] opacity-70">{t.duration}s</span>}
                          {t.tryNumber > 1 && <span className="text-[10px] opacity-70">x{t.tryNumber}</span>}
                        </div>
                        {idx < arr.length - 1 && <span className="text-zinc-600 text-xs">&rarr;</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                  {(() => {
                    const counts = tasks.reduce((acc, t) => { acc[t.state] = (acc[t.state] || 0) + 1; return acc; }, {} as Record<string, number>);
                    return Object.entries(counts).map(([state, count]) => {
                      const st = STATE_STYLES[state] || STATE_STYLES.no_status;
                      return (<span key={state} className={`flex items-center gap-1 ${st.color}`}><span className={`w-2 h-2 rounded-full ${st.bg}`} />{count} {state}</span>);
                    });
                  })()}
                  <span className="ml-auto">{tasks.length} total tasks</span>
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function RunsTable({ runs, onTrigger }: { runs: PipelineRun[]; onTrigger?: (dagId: string) => void }) {
  if (runs.length === 0) return <div className="p-6 text-center text-sm text-zinc-500">No runs</div>;
  return (
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
          {runs.map(run => (
            <RunRow key={run.runId} run={run} onTrigger={onTrigger ? () => onTrigger(run.dagId) : undefined} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DagRow({ dag, onTrigger, triggeringDag, actionLoading }: { dag: any; onTrigger: (id: string) => void; triggeringDag: string | null; actionLoading: string | null }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between hover:bg-zinc-800/30 transition">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {dag.isPaused ? <Pause className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" /> : <Play className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
          <span className={`text-sm truncate ${dag.isPaused ? 'text-zinc-500' : 'text-text-primary'} font-medium`}>{dag.dagId}</span>
          {dag.tags.map((tag: string) => (
            <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700 flex-shrink-0">{tag}</span>
          ))}
        </div>
        {dag.description && <p className="text-xs text-zinc-500 mt-0.5 truncate ml-5">{dag.description}</p>}
        {dag.schedule && (
          <div className="flex items-center gap-3 mt-1 ml-5">
            <span className="text-xs text-zinc-500"><Clock className="w-3 h-3 inline mr-1" />{dag.schedule}</span>
            {dag.nextRun && <span className="text-xs text-zinc-500">Next: {new Date(dag.nextRun).toLocaleString()}</span>}
          </div>
        )}
      </div>
      <button
        onClick={() => onTrigger(dag.dagId)}
        disabled={actionLoading !== null || dag.isPaused || triggeringDag === dag.dagId}
        className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50"
      >
        {triggeringDag === dag.dagId ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 text-emerald-400" />}
        Trigger
      </button>
    </div>
  );
}

export default function PipelinesTab({ pipelines, runAction, actionLoading }: PipelinesTabProps) {
  const [triggeringDag, setTriggeringDag] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<SubTab>('overview');

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
          <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Workflow className="w-5 h-5 text-amber-400" /> Pipeline Orchestration</h2>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 font-medium">Airflow Not Connected</p>
            <p className="text-sm text-zinc-400 mt-1">{pipelines.errorMessage || 'Configure Airflow credentials in Settings > Integrations to enable pipeline monitoring.'}</p>
            <a href="/admin/settings" className="inline-flex items-center gap-1 mt-2 text-xs text-accent-primary hover:text-accent-primary-hover"><Settings className="w-3 h-3" /> Go to Settings</a>
          </div>
        </div>
      </div>
    );
  }

  // Filtered: only implementation DAGs for Overview & Scheduled
  const implDags = pipelines.dags.filter(isImplementationDag);
  const implDagIds = new Set(implDags.map(d => d.dagId));
  const scheduledDags = implDags.filter(d => !d.isPaused && d.schedule);
  const pausedDags = implDags.filter(d => d.isPaused);
  const implActiveRuns = pipelines.activeRuns.filter(r => implDagIds.has(r.dagId));
  const implRecentRuns = pipelines.recentRuns.filter(r => implDagIds.has(r.dagId));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Workflow className="w-5 h-5 text-amber-400" /> Pipeline Orchestration</h2>
        <a href="#" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition">
          <ExternalLink className="w-3 h-3" /> Open Airflow UI
        </a>
      </div>

      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-zinc-800 pb-0">
        {SUB_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = subTab === tab.key;
          const badge = tab.key === 'scheduled' ? scheduledDags.length : tab.key === 'all' ? pipelines.dags.length : null;
          return (
            <button key={tab.key} onClick={() => setSubTab(tab.key)} className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-[1px] transition ${isActive ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
              {badge !== null && <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] ${isActive ? 'bg-amber-500/20 text-amber-400' : 'bg-zinc-800 text-zinc-500'}`}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {subTab === 'overview' && (
        <div className="space-y-4">
          {/* Stats summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500">Total DAGs</p>
              <p className="text-2xl font-bold text-white mt-1">{implDags.length}</p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-zinc-500">Active Runs</p>
              <p className="text-2xl font-bold text-amber-400 mt-1">{implActiveRuns.length}</p>
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
          {implActiveRuns.length > 0 && (
            <div className="bg-zinc-900 border border-amber-500/30 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                <h3 className="text-sm font-semibold text-white">Active Runs</h3>
                <span className="px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-400">{implActiveRuns.length}</span>
              </div>
              <RunsTable runs={implActiveRuns} />
            </div>
          )}

          {/* Recent Runs */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-white">Recent Runs</h3>
            </div>
            <RunsTable runs={implRecentRuns} onTrigger={triggerDag} />
          </div>
        </div>
      )}

      {subTab === 'scheduled' && (
        <div className="space-y-4">
          {scheduledDags.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
              <Calendar className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
              <p className="text-zinc-400 text-sm">No scheduled DAGs</p>
              <p className="text-xs text-zinc-600 mt-1">Create scheduled DAGs in Airflow to see them here</p>
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
              {scheduledDags.map(dag => (
                <DagRow key={dag.dagId} dag={dag} onTrigger={triggerDag} triggeringDag={triggeringDag} actionLoading={actionLoading} />
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'all' && (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-800/50">
            {pipelines.dags.length === 0 ? (
              <div className="p-8 text-center">
                <List className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                <p className="text-zinc-400 text-sm">No DAGs found</p>
              </div>
            ) : (
              pipelines.dags.map(dag => (
                <DagRow key={dag.dagId} dag={dag} onTrigger={triggerDag} triggeringDag={triggeringDag} actionLoading={actionLoading} />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
