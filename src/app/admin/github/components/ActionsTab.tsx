'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Workflow, Loader2, ChevronDown, ChevronRight, ExternalLink,
  RefreshCw, CheckCircle2, XCircle, Clock, Ban, RotateCw,
  Play, StopCircle, Timer,
} from 'lucide-react';

interface WorkflowRun {
  id: number;
  name: string;
  workflowId: number;
  status: string;
  conclusion: string | null;
  branch: string;
  event: string;
  actor: string;
  repo: string;
  runNumber: number;
  runAttempt: number;
  createdAt: string;
  updatedAt: string;
  url: string;
  headSha: string;
  headMessage: string;
}

interface WorkflowRunJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  steps: Array<{
    name: string;
    status: string;
    conclusion: string | null;
    number: number;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const seconds = Math.floor((now - d) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function duration(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diff = Math.floor((e - s) / 1000);
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  const sec = diff % 60;
  if (m < 60) return `${m}m ${sec}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function ConclusionIcon({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === 'in_progress' || status === 'queued') return <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />;
  switch (conclusion) {
    case 'success': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case 'failure': return <XCircle className="w-4 h-4 text-red-400" />;
    case 'cancelled': return <Ban className="w-4 h-4 text-zinc-500" />;
    case 'skipped': return <Clock className="w-4 h-4 text-zinc-500" />;
    default: return <Clock className="w-4 h-4 text-zinc-500" />;
  }
}

function conclusionColor(status: string, conclusion: string | null): string {
  if (status === 'in_progress' || status === 'queued') return 'border-amber-500/30';
  switch (conclusion) {
    case 'success': return 'border-emerald-500/30';
    case 'failure': return 'border-red-500/30';
    default: return 'border-zinc-800';
  }
}

function eventBadgeColor(event: string): string {
  switch (event) {
    case 'push': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    case 'pull_request': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
    case 'workflow_dispatch': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'schedule': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
    default: return 'bg-zinc-700/50 text-zinc-400 border-zinc-600';
  }
}

interface Props {
  repo: string;
  autoRefresh: boolean;
  refreshKey: number;
}

export default function ActionsTab({ repo, autoRefresh, refreshKey }: Props) {
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const [jobs, setJobs] = useState<WorkflowRunJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repo) params.set('repo', repo);
      if (statusFilter) params.set('status', statusFilter);
      params.set('perPage', '30');
      const res = await fetch(`/api/admin/cockpit/github/actions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRuns(data.runs || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [repo, statusFilter]);

  useEffect(() => { fetchRuns(); }, [fetchRuns, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchRuns, 30000);
    return () => clearInterval(interval);
  }, [fetchRuns, autoRefresh]);

  const loadJobs = async (run: WorkflowRun) => {
    if (expandedRun === run.id) {
      setExpandedRun(null); setJobs([]); setExpandedJob(null);
      return;
    }
    setExpandedRun(run.id);
    setJobsLoading(true);
    setExpandedJob(null);
    try {
      const res = await fetch('/api/admin/cockpit/github/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'jobs', repo: run.repo, runId: run.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } catch { /* silent */ } finally {
      setJobsLoading(false);
    }
  };

  const handleAction = async (action: 'rerun' | 'cancel', run: WorkflowRun) => {
    const label = action === 'rerun' ? 'Re-run' : 'Cancel';
    if (!confirm(`${label} workflow "${run.name}" (#${run.runNumber})?`)) return;
    setActionLoading(`${action}-${run.id}`);
    try {
      const res = await fetch('/api/admin/cockpit/github/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, repo: run.repo, runId: run.id }),
      });
      const data = await res.json();
      if (data.success) {
        setActionResult({ msg: data.message, ok: true });
        setTimeout(fetchRuns, 2000);
      } else {
        setActionResult({ msg: data.message || `${label} failed`, ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  useEffect(() => {
    if (actionResult) {
      const t = setTimeout(() => setActionResult(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionResult]);

  const inProgress = runs.filter(r => r.status === 'in_progress' || r.status === 'queued');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Workflow className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Actions</h2>
          <span className="text-xs text-zinc-500">({runs.length} runs)</span>
          {inProgress.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {inProgress.length} running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            <option value="">All statuses</option>
            <option value="completed">Completed</option>
            <option value="in_progress">In Progress</option>
            <option value="queued">Queued</option>
          </select>
          <button onClick={fetchRuns} className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionResult && (
        <div className={`px-3 py-2 rounded-lg text-sm ${actionResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {actionResult.msg}
        </div>
      )}

      {loading && runs.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading workflow runs…
        </div>
      ) : runs.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Workflow className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No workflow runs found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <div key={run.id} className={`bg-zinc-900 border rounded-lg overflow-hidden ${conclusionColor(run.status, run.conclusion)}`}>
              {/* Run row */}
              <button
                onClick={() => loadJobs(run)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition text-left"
              >
                {expandedRun === run.id ? <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />}
                <ConclusionIcon status={run.status} conclusion={run.conclusion} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{run.name}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${eventBadgeColor(run.event)}`}>{run.event}</span>
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    #{run.runNumber} · {run.repo.split('/')[1]} · {run.branch} · {run.actor} · {run.headSha}
                  </div>
                  {run.headMessage && (
                    <div className="text-xs text-zinc-600 mt-0.5 truncate">{run.headMessage.split('\n')[0]}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-zinc-500">{timeAgo(run.createdAt)}</span>
                </div>
              </button>

              {/* Expanded: Jobs & Steps */}
              {expandedRun === run.id && (
                <div className="border-t border-zinc-800 bg-zinc-950 p-4 space-y-3">
                  {/* Run actions */}
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-800">
                    {run.status === 'completed' && (
                      <button
                        onClick={() => handleAction('rerun', run)}
                        disabled={!!actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium border border-blue-500/30 disabled:opacity-50 transition"
                      >
                        {actionLoading === `rerun-${run.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCw className="w-3 h-3" />}
                        Re-run
                      </button>
                    )}
                    {(run.status === 'in_progress' || run.status === 'queued') && (
                      <button
                        onClick={() => handleAction('cancel', run)}
                        disabled={!!actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30 disabled:opacity-50 transition"
                      >
                        {actionLoading === `cancel-${run.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <StopCircle className="w-3 h-3" />}
                        Cancel
                      </button>
                    )}
                    <div className="flex-1" />
                    <a href={run.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition">
                      <ExternalLink className="w-3 h-3" /> GitHub
                    </a>
                  </div>

                  {/* Jobs */}
                  {jobsLoading ? (
                    <div className="flex items-center justify-center py-6 text-zinc-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading jobs…
                    </div>
                  ) : jobs.length === 0 ? (
                    <p className="text-zinc-500 text-sm text-center py-4">No jobs found</p>
                  ) : (
                    <div className="space-y-2">
                      {jobs.map(job => (
                        <div key={job.id} className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
                          <button
                            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                            className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800/50 transition text-left"
                          >
                            {expandedJob === job.id ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                            <ConclusionIcon status={job.status} conclusion={job.conclusion} />
                            <span className="text-sm text-zinc-200 flex-1">{job.name}</span>
                            {job.startedAt && (
                              <span className="text-xs text-zinc-500 flex items-center gap-1">
                                <Timer className="w-3 h-3" />
                                {duration(job.startedAt, job.completedAt)}
                              </span>
                            )}
                          </button>

                          {/* Steps */}
                          {expandedJob === job.id && job.steps.length > 0 && (
                            <div className="border-t border-zinc-800 bg-zinc-950 px-3 py-2">
                              <div className="space-y-0.5">
                                {job.steps.map(step => (
                                  <div key={step.number} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-zinc-900/50">
                                    <span className="text-xs text-zinc-600 w-5 text-right">{step.number}</span>
                                    <ConclusionIcon status={step.status} conclusion={step.conclusion} />
                                    <span className="text-xs text-zinc-300 flex-1 truncate">{step.name}</span>
                                    {step.startedAt && (
                                      <span className="text-xs text-zinc-600">{duration(step.startedAt, step.completedAt)}</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
