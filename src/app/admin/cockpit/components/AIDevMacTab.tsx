'use client';

import { useState } from 'react';
import {
  RotateCcw, XCircle, AlertTriangle, CheckCircle2, Loader2,
  Clock, Play, Workflow, GitBranch,
} from 'lucide-react';

interface AirflowRun {
  dagId: string;
  runId: string;
  state: string;
  startDate: string | null;
  endDate: string | null;
  executionDate: string;
  conf: Record<string, unknown>;
  note: string | null;
  durationMs: number | null;
  isStuck: boolean;
}

interface AIDevMacTabProps {
  data: { configured: boolean; runs: AirflowRun[]; error?: string } | null;
  loading: boolean;
  onRefetch: () => void;
}

const WINDOW_HOURS = 24;

function formatDuration(ms: number | null): string {
  if (!ms) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return isToday ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function runColor(state: string, isStuck: boolean) {
  if (isStuck) return { bar: 'bg-orange-500/70', text: 'text-orange-400', border: 'border-orange-500/40' };
  switch (state) {
    case 'running': return { bar: 'bg-amber-400/60', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'queued': return { bar: 'bg-blue-400/40', text: 'text-blue-400', border: 'border-blue-500/30' };
    case 'success': return { bar: 'bg-emerald-500/60', text: 'text-emerald-400', border: 'border-emerald-500/30' };
    case 'failed':
    case 'upstream_failed': return { bar: 'bg-red-500/70', text: 'text-red-400', border: 'border-red-500/30' };
    default: return { bar: 'bg-zinc-600/40', text: 'text-zinc-500', border: 'border-zinc-700/30' };
  }
}

function StatusBadge({ state, isStuck }: { state: string; isStuck: boolean }) {
  const c = runColor(state, isStuck);
  const label = isStuck ? 'stuck' : state.replace(/_/g, ' ');
  const Icon = isStuck ? AlertTriangle
    : state === 'running' ? Loader2
    : state === 'success' ? CheckCircle2
    : (state === 'failed' || state === 'upstream_failed') ? XCircle
    : Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${c.text} ${c.border} bg-transparent`}>
      <Icon className={`w-3 h-3 flex-shrink-0 ${state === 'running' && !isStuck ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function dagDisplayName(dagId: string): string {
  return dagId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AIDevMacTab({ data, loading, onRefetch }: AIDevMacTabProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ ok: boolean; msg: string } | null>(null);

  const now = Date.now();
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = now - windowMs;

  const runs: AirflowRun[] = data?.runs || [];

  async function handleAction(dagId: string, runId: string | undefined, action: 'trigger' | 'clear' | 'mark-failed') {
    const key = `${runId || dagId}-${action}`;
    setActionLoading(key);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/cockpit/tab/ai-dev-mac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, dagId, runId }),
      });
      const result = await res.json();
      setActionMsg({ ok: res.ok, msg: res.ok ? result.message : result.error });
      if (res.ok) setTimeout(onRefetch, 2000);
    } catch {
      setActionMsg({ ok: false, msg: 'Request failed' });
    } finally {
      setActionLoading(null);
    }
  }

  // Group runs by DAG for timeline rows
  const dagIds = Array.from(new Set(runs.map(r => r.dagId))).sort();

  // Time axis labels — every 4 hours
  const axisLabels: { label: string; pct: number }[] = [];
  for (let h = 0; h <= WINDOW_HOURS; h += 4) {
    const ts = windowStart + h * 60 * 60 * 1000;
    const d = new Date(ts);
    axisLabels.push({
      label: d.getHours() === 0 ? `00:00` : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      pct: (h / WINDOW_HOURS) * 100,
    });
  }

  function runBarStyle(run: AirflowRun) {
    const start = run.startDate ? new Date(run.startDate).getTime() : new Date(run.executionDate).getTime();
    const startMs = Math.max(start, windowStart);
    const endMs = run.endDate ? new Date(run.endDate).getTime() : Math.min(now, windowStart + windowMs);
    const left = ((startMs - windowStart) / windowMs) * 100;
    const width = Math.max(((endMs - startMs) / windowMs) * 100, 0.3);
    return { left: `${left}%`, width: `${width}%` };
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data?.configured) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
        <Workflow className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
        <p className="text-sm text-zinc-400">{data?.error || 'Airflow not configured'}</p>
        <p className="text-xs text-zinc-600 mt-1">Add Airflow credentials in Settings → Integrations.</p>
      </div>
    );
  }

  const stuckCount = runs.filter(r => r.isStuck).length;
  const runningCount = runs.filter(r => r.state === 'running' && !r.isStuck).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Workflow className="w-3.5 h-3.5" />
          <span>Airflow · last {WINDOW_HOURS}h · {runs.length} runs</span>
          {stuckCount > 0 && <span className="text-orange-400">{stuckCount} stuck</span>}
          {runningCount > 0 && <span className="text-amber-400">{runningCount} running</span>}
        </div>
        <button
          onClick={onRefetch}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          title="Refresh"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`px-3 py-2 rounded-lg text-xs border ${actionMsg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {actionMsg.msg}
        </div>
      )}

      {/* Timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-400 mb-3 flex items-center gap-1.5">
          <Play className="w-3.5 h-3.5 text-indigo-400" /> DAG Run Timeline
        </h3>

        {runs.length === 0 ? (
          <p className="text-xs text-zinc-600 py-4 text-center">No runs in the last {WINDOW_HOURS} hours</p>
        ) : (
          <div className="space-y-3">
            {dagIds.map(dagId => {
              const dagRuns = runs.filter(r => r.dagId === dagId && (r.startDate ? new Date(r.startDate).getTime() >= windowStart : true));
              if (dagRuns.length === 0) return null;
              return (
                <div key={dagId}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded border bg-indigo-500/10 text-indigo-400 border-indigo-500/25 font-medium truncate max-w-[180px]">
                      {dagId}
                    </span>
                    <span className="text-[10px] text-zinc-600">{dagRuns.length} runs</span>
                  </div>
                  {/* Timeline row */}
                  <div className="relative h-7 bg-zinc-800/50 rounded-md overflow-hidden">
                    {axisLabels.slice(1, -1).map(a => (
                      <div
                        key={a.pct}
                        className="absolute top-0 bottom-0 w-px bg-zinc-700/40"
                        style={{ left: `${a.pct}%` }}
                      />
                    ))}
                    {dagRuns.map(run => {
                      const c = runColor(run.state, run.isStuck);
                      const style = runBarStyle(run);
                      return (
                        <div
                          key={run.runId}
                          className={`absolute top-1 h-5 rounded-sm ${c.bar} cursor-pointer hover:opacity-90 transition-opacity`}
                          style={style}
                          title={`${run.dagId} · ${run.state} · ${formatDuration(run.durationMs)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Time axis */}
            <div className="relative h-5 mt-1">
              {axisLabels.map(a => (
                <span
                  key={a.pct}
                  className="absolute text-[9px] text-zinc-600 -translate-x-1/2"
                  style={{ left: `${a.pct}%` }}
                >
                  {a.label}
                </span>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-zinc-800">
              {[
                { color: 'bg-amber-400/60', label: 'running' },
                { color: 'bg-emerald-500/60', label: 'success' },
                { color: 'bg-red-500/70', label: 'failed' },
                { color: 'bg-orange-500/70', label: 'stuck' },
                { color: 'bg-blue-400/40', label: 'queued' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <div className={`w-3 h-2 rounded-sm ${l.color}`} /> {l.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Run Log Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-1.5">
          <GitBranch className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-xs font-semibold text-zinc-400">Run Log</span>
        </div>
        {runs.length === 0 ? (
          <p className="text-xs text-zinc-600 p-4 text-center">No runs in the last {WINDOW_HOURS} hours</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">DAG</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Run ID</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Started</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Ended</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const triggerKey = `${run.dagId}-trigger`;
                  const clearKey = `${run.runId}-clear`;
                  const failKey = `${run.runId}-mark-failed`;
                  const canClear = run.isStuck || run.state === 'running';
                  const canMarkFailed = run.state === 'running' || run.isStuck;
                  return (
                    <tr key={run.runId} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition ${run.isStuck ? 'bg-orange-500/5' : ''}`}>
                      <td className="px-3 py-2.5">
                        <div className="text-zinc-200 font-medium">{dagDisplayName(run.dagId)}</div>
                        <div className="text-zinc-600 font-mono mt-0.5 text-[10px] truncate max-w-[120px]">{run.dagId}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="font-mono text-zinc-500 text-[10px] truncate block max-w-[160px]">{run.runId}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge state={run.state} isStuck={run.isStuck} />
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(run.startDate)}</td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(run.endDate)}</td>
                      <td className="px-3 py-2.5 text-zinc-400 font-mono">{formatDuration(run.durationMs)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Trigger new run for this DAG */}
                          <button
                            onClick={() => handleAction(run.dagId, undefined, 'trigger')}
                            disabled={actionLoading === triggerKey}
                            className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-40 text-[11px]"
                            title="Trigger new run"
                          >
                            {actionLoading === triggerKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                            Trigger
                          </button>
                          {/* Clear (retry) stuck run */}
                          {canClear && (
                            <button
                              onClick={() => handleAction(run.dagId, run.runId, 'clear')}
                              disabled={actionLoading === clearKey}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-amber-700/40 text-amber-400 hover:bg-amber-900/20 hover:border-amber-600/60 transition disabled:opacity-40 text-[11px]"
                              title="Clear / retry stuck tasks"
                            >
                              {actionLoading === clearKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              Clear
                            </button>
                          )}
                          {/* Mark failed (cancel) */}
                          {canMarkFailed && (
                            <button
                              onClick={() => handleAction(run.dagId, run.runId, 'mark-failed')}
                              disabled={actionLoading === failKey}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-red-700/40 text-red-400 hover:bg-red-900/20 hover:border-red-600/60 transition disabled:opacity-40 text-[11px]"
                              title="Mark as failed (stops the run)"
                            >
                              {actionLoading === failKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                              Fail
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
