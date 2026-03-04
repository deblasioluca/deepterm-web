'use client';

import { useState } from 'react';
import {
  ExternalLink, RotateCcw, XCircle, AlertTriangle, CheckCircle2, Loader2,
  Clock, Play, GitBranch, Github,
} from 'lucide-react';

interface CIRun {
  id: number;
  repo: string;
  name: string;
  workflow: string;
  branch: string;
  runNumber: number;
  event: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  isStuck: boolean;
  url: string;
}

interface CIMacTabProps {
  data: { configured: boolean; runs: CIRun[]; error?: string } | null;
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

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  return isToday ? fmtTime(iso) : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${fmtTime(iso)}`;
}

function runColor(status: string, conclusion: string | null, isStuck: boolean) {
  if (isStuck) return { bar: 'bg-orange-500/70', text: 'text-orange-400', border: 'border-orange-500/40' };
  if (status === 'in_progress') return { bar: 'bg-amber-400/60', text: 'text-amber-400', border: 'border-amber-500/30' };
  if (status === 'queued') return { bar: 'bg-blue-400/40', text: 'text-blue-400', border: 'border-blue-500/30' };
  if (conclusion === 'success') return { bar: 'bg-emerald-500/60', text: 'text-emerald-400', border: 'border-emerald-500/30' };
  if (conclusion === 'failure') return { bar: 'bg-red-500/70', text: 'text-red-400', border: 'border-red-500/30' };
  if (conclusion === 'cancelled') return { bar: 'bg-zinc-600/60', text: 'text-zinc-400', border: 'border-zinc-600/30' };
  return { bar: 'bg-zinc-600/40', text: 'text-zinc-500', border: 'border-zinc-700/30' };
}

function StatusBadge({ status, conclusion, isStuck }: { status: string; conclusion: string | null; isStuck: boolean }) {
  const c = runColor(status, conclusion, isStuck);
  const label = isStuck ? 'stuck' : (status === 'completed' ? (conclusion || 'done') : status.replace('_', ' '));
  const Icon = isStuck ? AlertTriangle
    : status === 'in_progress' ? Loader2
    : conclusion === 'success' ? CheckCircle2
    : conclusion === 'failure' ? XCircle
    : conclusion === 'cancelled' ? XCircle
    : Clock;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border ${c.text} ${c.border} bg-transparent`}>
      <Icon className={`w-3 h-3 flex-shrink-0 ${status === 'in_progress' && !isStuck ? 'animate-spin' : ''}`} />
      {label}
    </span>
  );
}

function RepoBadge({ repo }: { repo: string }) {
  const colors: Record<string, string> = {
    'deepterm-web': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
    'deepterm': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${colors[repo] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
      {repo}
    </span>
  );
}

export default function CIMacTab({ data, loading, onRefetch }: CIMacTabProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  const now = Date.now();
  const windowMs = WINDOW_HOURS * 60 * 60 * 1000;
  const windowStart = now - windowMs;

  const runs: CIRun[] = data?.runs || [];

  async function handleAction(runId: number, repo: string, action: 'rerun' | 'cancel') {
    const key = `${runId}-${action}`;
    setActionLoading(key);
    setActionMsg(null);
    try {
      const res = await fetch('/api/admin/cockpit/tab/ci-mac', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, repo, action }),
      });
      const result = await res.json();
      setActionMsg({ id: key, ok: res.ok, msg: res.ok ? result.message : result.error });
      if (res.ok) setTimeout(onRefetch, 2000);
    } catch (e) {
      setActionMsg({ id: key, ok: false, msg: 'Request failed' });
    } finally {
      setActionLoading(null);
    }
  }

  // Group runs by repo for timeline rows
  const repos = Array.from(new Set(runs.map(r => r.repo))).sort();

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

  function runBarStyle(run: CIRun) {
    const startMs = Math.max(new Date(run.startedAt).getTime(), windowStart);
    const endMs = run.endedAt ? new Date(run.endedAt).getTime() : Math.min(now, windowStart + windowMs);
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
        <Github className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
        <p className="text-sm text-zinc-400">{data?.error || 'GitHub not configured'}</p>
        <p className="text-xs text-zinc-600 mt-1">Set GITHUB_TOKEN in your environment variables.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Github className="w-3.5 h-3.5" />
          <span>GitHub Actions · last {WINDOW_HOURS}h · {runs.length} runs</span>
          {runs.filter(r => r.isStuck).length > 0 && (
            <span className="text-orange-400">{runs.filter(r => r.isStuck).length} stuck</span>
          )}
          {runs.filter(r => r.status === 'in_progress' && !r.isStuck).length > 0 && (
            <span className="text-amber-400">{runs.filter(r => r.status === 'in_progress' && !r.isStuck).length} running</span>
          )}
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
          <Play className="w-3.5 h-3.5 text-emerald-400" /> Run Timeline
        </h3>

        {runs.length === 0 ? (
          <p className="text-xs text-zinc-600 py-4 text-center">No runs in the last {WINDOW_HOURS} hours</p>
        ) : (
          <div className="space-y-3">
            {repos.map(repo => {
              const repoRuns = runs.filter(r => r.repo === repo && new Date(r.startedAt).getTime() >= windowStart);
              if (repoRuns.length === 0) return null;
              return (
                <div key={repo}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <RepoBadge repo={repo} />
                    <span className="text-[10px] text-zinc-600">{repoRuns.length} runs</span>
                  </div>
                  {/* Timeline row */}
                  <div className="relative h-7 bg-zinc-800/50 rounded-md overflow-hidden">
                    {/* Hour grid lines */}
                    {axisLabels.slice(1, -1).map(a => (
                      <div
                        key={a.pct}
                        className="absolute top-0 bottom-0 w-px bg-zinc-700/40"
                        style={{ left: `${a.pct}%` }}
                      />
                    ))}
                    {/* Run bars */}
                    {repoRuns.map(run => {
                      const c = runColor(run.status, run.conclusion, run.isStuck);
                      const style = runBarStyle(run);
                      return (
                        <div
                          key={run.id}
                          className={`absolute top-1 h-5 rounded-sm ${c.bar} cursor-pointer hover:opacity-90 transition-opacity`}
                          style={style}
                          title={`${run.name} · ${run.status === 'completed' ? run.conclusion : run.status} · ${formatDuration(run.durationMs)}`}
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
                { color: 'bg-red-500/70', label: 'failure' },
                { color: 'bg-orange-500/70', label: 'stuck' },
                { color: 'bg-zinc-600/60', label: 'cancelled' },
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
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Repo</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Workflow / Branch</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Started</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Ended</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const rerunKey = `${run.id}-rerun`;
                  const cancelKey = `${run.id}-cancel`;
                  const canRerun = run.status === 'completed' && (run.conclusion === 'failure' || run.conclusion === 'cancelled') || run.isStuck;
                  const canCancel = run.status === 'in_progress' || run.status === 'queued';
                  return (
                    <tr key={run.id} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition ${run.isStuck ? 'bg-orange-500/5' : ''}`}>
                      <td className="px-3 py-2.5">
                        <RepoBadge repo={run.repo} />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-zinc-200 font-medium truncate max-w-[200px]">{run.workflow}</div>
                        <div className="text-zinc-600 mt-0.5">{run.branch} · #{run.runNumber}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusBadge status={run.status} conclusion={run.conclusion} isStuck={run.isStuck} />
                      </td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(run.startedAt)}</td>
                      <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap">{fmtDate(run.endedAt)}</td>
                      <td className="px-3 py-2.5 text-zinc-400 font-mono">{formatDuration(run.durationMs)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          {canRerun && (
                            <button
                              onClick={() => handleAction(run.id, run.repo, 'rerun')}
                              disabled={actionLoading === rerunKey}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-40 text-[11px]"
                              title="Re-run"
                            >
                              {actionLoading === rerunKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                              Re-run
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => handleAction(run.id, run.repo, 'cancel')}
                              disabled={actionLoading === cancelKey}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 border border-red-700/40 text-red-400 hover:bg-red-900/20 hover:border-red-600/60 transition disabled:opacity-40 text-[11px]"
                              title="Cancel"
                            >
                              {actionLoading === cancelKey ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                              Cancel
                            </button>
                          )}
                          <a
                            href={run.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 transition"
                            title="View in GitHub"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
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
