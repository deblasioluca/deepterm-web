'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Play,
  Square,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Settings2,
  Brain,
  Code2,
  Eye,
  AlertTriangle,
  Zap,
} from 'lucide-react';

// ── Types ────────────────────────────────────────

interface AgentLoopConfig {
  id: string;
  name: string;
  description: string;
  provider: string;
  model: string;
  maxIterations: number;
  targetRepo: string;
  targetBranch: string;
  allowedPaths: string;
  forbiddenPaths: string;
  systemPrompt: string;
  autoCreatePR: boolean;
  requireTests: boolean;
  requireBuild: boolean;
  isEnabled: boolean;
  _count?: { loops: number };
}

interface AgentIteration {
  id: string;
  iteration: number;
  phase: string;
  thinking: string;
  action: string;
  observation: string;
  filesChanged: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  createdAt: string;
}

interface AgentLoop {
  id: string;
  status: string;
  branchName: string;
  prNumber: number | null;
  prUrl: string | null;
  totalIterations: number;
  maxIterations: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  errorLog: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  config?: { name: string; model: string; provider: string } | null;
  story?: { title: string; status: string; priority: string } | null;
  iterations?: AgentIteration[];
  _count?: { iterations: number };
}

interface StoryOption {
  id: string;
  title: string;
  status: string;
  priority: string;
}

// ── Status Helpers ───────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  queued: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  running: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  awaiting_review: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
  cancelled: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  queued: <Clock className="w-3.5 h-3.5" />,
  running: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  awaiting_review: <Eye className="w-3.5 h-3.5" />,
  completed: <CheckCircle2 className="w-3.5 h-3.5" />,
  failed: <XCircle className="w-3.5 h-3.5" />,
  cancelled: <Square className="w-3.5 h-3.5" />,
};

const PHASE_ICONS: Record<string, React.ReactNode> = {
  thinking: <Brain className="w-3 h-3 text-purple-400" />,
  acting: <Code2 className="w-3 h-3 text-blue-400" />,
  observing: <Eye className="w-3 h-3 text-yellow-400" />,
  complete: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  error: <AlertTriangle className="w-3 h-3 text-red-400" />,
};

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function timeAgo(dateStr: string): string {
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ── Main Component ───────────────────────────────

export default function AgentLoopTab() {
  const [loops, setLoops] = useState<AgentLoop[]>([]);
  const [stats, setStats] = useState<Array<{ status: string; _count: number }>>([]);
  const [configs, setConfigs] = useState<AgentLoopConfig[]>([]);
  const [stories, setStories] = useState<StoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLoop, setExpandedLoop] = useState<string | null>(null);
  const [loopDetail, setLoopDetail] = useState<AgentLoop | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // New loop form state
  const [newStoryId, setNewStoryId] = useState('');
  const [newConfigId, setNewConfigId] = useState('');
  const [newMaxIter, setNewMaxIter] = useState(10);

  // Fetch loops and configs
  const fetchData = useCallback(async () => {
    try {
      const [loopsRes, configsRes, storiesRes] = await Promise.all([
        fetch('/api/admin/cockpit/agent-loop'),
        fetch('/api/admin/cockpit/agent-loop/configs'),
        fetch('/api/admin/cockpit/planning?type=stories&status=ready,in_progress').catch(() => null),
      ]);

      if (loopsRes.ok) {
        const data = await loopsRes.json();
        setLoops(data.loops || []);
        setStats(data.stats || []);
      }
      if (configsRes.ok) {
        setConfigs(await configsRes.json());
      }
      if (storiesRes?.ok) {
        const storiesData = await storiesRes.json();
        setStories(storiesData.stories || storiesData || []);
      }
    } catch (e) {
      console.error('Failed to fetch agent loop data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Fetch loop detail
  const fetchDetail = async (id: string) => {
    if (expandedLoop === id) {
      setExpandedLoop(null);
      setLoopDetail(null);
      return;
    }
    setExpandedLoop(id);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/cockpit/agent-loop/${id}`);
      if (res.ok) setLoopDetail(await res.json());
    } catch (e) {
      console.error('Failed to fetch loop detail:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  // Start new loop
  const startLoop = async () => {
    if (!newStoryId) return;
    setActionLoading('starting');
    try {
      const res = await fetch('/api/admin/cockpit/agent-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storyId: newStoryId,
          configId: newConfigId || undefined,
          maxIterations: newMaxIter,
        }),
      });
      if (res.ok) {
        setShowNewForm(false);
        setNewStoryId('');
        fetchData();
      }
    } catch (e) {
      console.error('Failed to start loop:', e);
    } finally {
      setActionLoading(null);
    }
  };

  // Loop actions
  const loopAction = async (id: string, action: string, reason?: string) => {
    setActionLoading(`${action}-${id}`);
    try {
      await fetch(`/api/admin/cockpit/agent-loop/${id}`, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'delete' ? undefined : JSON.stringify({ action, reason }),
      });
      fetchData();
      if (expandedLoop === id) {
        setExpandedLoop(null);
        setLoopDetail(null);
      }
    } catch (e) {
      console.error(`Failed to ${action} loop:`, e);
    } finally {
      setActionLoading(null);
    }
  };

  // Create default config
  const createDefaultConfig = async () => {
    setActionLoading('create-config');
    try {
      await fetch('/api/admin/cockpit/agent-loop/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'default',
          description: 'Default agent loop configuration',
          maxIterations: 10,
          requireTests: true,
          requireBuild: true,
        }),
      });
      fetchData();
    } catch (e) {
      console.error('Failed to create config:', e);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const runningCount = stats.find(s => s.status === 'running')?._count || 0;
  const queuedCount = stats.find(s => s.status === 'queued')?._count || 0;
  const completedCount = stats.find(s => s.status === 'completed')?._count || 0;
  const failedCount = stats.find(s => s.status === 'failed')?._count || 0;

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Running', value: runningCount, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Queued', value: queuedCount, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Completed', value: completedCount, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Failed', value: failedCount, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border border-zinc-800 rounded-lg p-3`}>
            <p className="text-xs text-zinc-500">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600/20 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 hover:bg-emerald-600/30 transition"
        >
          <Play className="w-3.5 h-3.5" /> New Agent Loop
        </button>
        <button
          onClick={() => setShowConfigPanel(!showConfigPanel)}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
        >
          <Settings2 className="w-3.5 h-3.5" /> Configs ({configs.length})
        </button>
      </div>

      {/* New Loop Form */}
      {showNewForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Bot className="w-4 h-4 text-emerald-400" /> Start New Agent Loop
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Story *</label>
              <select
                value={newStoryId}
                onChange={(e) => setNewStoryId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
              >
                <option value="">Select a story...</option>
                {stories.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.priority}] {s.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Config</label>
              <select
                value={newConfigId}
                onChange={(e) => setNewConfigId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
              >
                <option value="">Default</option>
                {configs.filter(c => c.isEnabled).map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.model})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Max Iterations</label>
              <input
                type="number"
                min={1}
                max={50}
                value={newMaxIter}
                onChange={(e) => setNewMaxIter(parseInt(e.target.value) || 10)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startLoop}
              disabled={!newStoryId || actionLoading === 'starting'}
              className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 rounded text-xs text-white hover:bg-emerald-500 transition disabled:opacity-50"
            >
              {actionLoading === 'starting' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              Start Loop
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 bg-zinc-800 rounded text-xs text-zinc-400 hover:bg-zinc-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Config Panel */}
      {showConfigPanel && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-medium text-white flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-zinc-400" /> Agent Loop Configs
          </h3>
          {configs.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-zinc-500 mb-2">No configs yet.</p>
              <button
                onClick={createDefaultConfig}
                disabled={actionLoading === 'create-config'}
                className="px-3 py-1.5 bg-zinc-800 rounded text-xs text-zinc-300 hover:bg-zinc-700"
              >
                Create Default Config
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {configs.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2">
                  <div>
                    <span className="text-xs font-medium text-white">{c.name}</span>
                    <span className="text-xs text-zinc-500 ml-2">{c.model} · {c.maxIterations} max iter</span>
                    {c._count && <span className="text-xs text-zinc-600 ml-2">({c._count.loops} runs)</span>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${c.isEnabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-500'}`}>
                    {c.isEnabled ? 'Active' : 'Disabled'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loops List */}
      <div className="space-y-2">
        {loops.length === 0 ? (
          <div className="text-center py-12 text-zinc-500">
            <Bot className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No agent loops yet</p>
            <p className="text-xs mt-1">Start one by selecting a story above</p>
          </div>
        ) : (
          loops.map(loop => (
            <div key={loop.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              {/* Loop Header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-zinc-800/50 transition"
                onClick={() => fetchDetail(loop.id)}
              >
                {expandedLoop === loop.id ? (
                  <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                )}

                {/* Status badge */}
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${STATUS_COLORS[loop.status] || STATUS_COLORS.cancelled}`}>
                  {STATUS_ICONS[loop.status]}
                  {loop.status.replace('_', ' ')}
                </span>

                {/* Story title */}
                <span className="text-sm text-white truncate flex-1">
                  {loop.story?.title || loop.branchName || loop.id.slice(0, 8)}
                </span>

                {/* Meta */}
                <span className="text-xs text-zinc-500 shrink-0">
                  {loop.totalIterations}/{loop.maxIterations} iter
                </span>
                <span className="text-xs text-zinc-500 shrink-0">
                  {formatTokens(loop.inputTokens + loop.outputTokens)} tok
                </span>
                <span className="text-xs text-zinc-600 shrink-0">
                  {timeAgo(loop.createdAt)}
                </span>
              </div>

              {/* Expanded Detail */}
              {expandedLoop === loop.id && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
                    </div>
                  ) : loopDetail ? (
                    <div className="space-y-4">
                      {/* Loop Meta */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <span className="text-zinc-500">Branch:</span>
                          <span className="text-white ml-1">{loopDetail.branchName}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Config:</span>
                          <span className="text-white ml-1">{loopDetail.config?.name || 'default'}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Input:</span>
                          <span className="text-white ml-1">{formatTokens(loopDetail.inputTokens)}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Output:</span>
                          <span className="text-white ml-1">{formatTokens(loopDetail.outputTokens)}</span>
                        </div>
                      </div>

                      {/* Error Log */}
                      {loopDetail.errorLog && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                          <p className="text-xs text-red-400 font-medium mb-1">Error</p>
                          <p className="text-xs text-red-300/80 font-mono">{loopDetail.errorLog}</p>
                        </div>
                      )}

                      {/* Iterations */}
                      {loopDetail.iterations && loopDetail.iterations.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-xs font-medium text-zinc-400">Iterations</h4>
                          {loopDetail.iterations.map(iter => (
                            <IterationCard key={iter.id} iteration={iter} />
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
                        {loop.status === 'awaiting_review' && (
                          <>
                            <button
                              onClick={(e) => { e.stopPropagation(); loopAction(loop.id, 'approve'); }}
                              disabled={actionLoading !== null}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600/20 border border-emerald-500/30 rounded text-xs text-emerald-400 hover:bg-emerald-600/30"
                            >
                              <ThumbsUp className="w-3 h-3" /> Approve
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); loopAction(loop.id, 'reject', 'Needs revision'); }}
                              disabled={actionLoading !== null}
                              className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 border border-red-500/30 rounded text-xs text-red-400 hover:bg-red-600/30"
                            >
                              <ThumbsDown className="w-3 h-3" /> Reject
                            </button>
                          </>
                        )}
                        {['queued', 'running'].includes(loop.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); loopAction(loop.id, 'cancel'); }}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-1 px-2.5 py-1 bg-yellow-600/20 border border-yellow-500/30 rounded text-xs text-yellow-400 hover:bg-yellow-600/30"
                          >
                            <Square className="w-3 h-3" /> Cancel
                          </button>
                        )}
                        {['completed', 'failed', 'cancelled'].includes(loop.status) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); loopAction(loop.id, 'delete'); }}
                            disabled={actionLoading !== null}
                            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-700/50 border border-zinc-600/50 rounded text-xs text-zinc-400 hover:bg-zinc-700"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Iteration Card ───────────────────────────────

function IterationCard({ iteration }: { iteration: AgentIteration }) {
  const [expanded, setExpanded] = useState(false);
  const files: string[] = (() => {
    try { return JSON.parse(iteration.filesChanged); } catch { return []; }
  })();

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/40 rounded-lg">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-zinc-800/60"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
        {PHASE_ICONS[iteration.phase] || PHASE_ICONS.thinking}
        <span className="text-xs font-medium text-zinc-300">
          Iteration {iteration.iteration}
        </span>
        <span className="text-xs text-zinc-500">
          {iteration.phase}
        </span>
        {files.length > 0 && (
          <span className="text-xs text-zinc-600">{files.length} files</span>
        )}
        <span className="text-xs text-zinc-600 ml-auto">
          {formatDuration(iteration.durationMs)} · {formatTokens(iteration.inputTokens + iteration.outputTokens)} tok
        </span>
      </div>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-zinc-700/40 pt-2">
          {iteration.thinking && (
            <div>
              <p className="text-xs font-medium text-purple-400 mb-1 flex items-center gap-1">
                <Brain className="w-3 h-3" /> Thinking
              </p>
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded p-2 max-h-40 overflow-auto">
                {iteration.thinking}
              </pre>
            </div>
          )}
          {iteration.action && (
            <div>
              <p className="text-xs font-medium text-blue-400 mb-1 flex items-center gap-1">
                <Code2 className="w-3 h-3" /> Action
              </p>
              <pre className="text-xs text-zinc-400 whitespace-pre-wrap font-mono bg-zinc-900/50 rounded p-2 max-h-60 overflow-auto">
                {iteration.action}
              </pre>
            </div>
          )}
          {iteration.observation && (
            <div>
              <p className="text-xs font-medium text-yellow-400 mb-1 flex items-center gap-1">
                <Eye className="w-3 h-3" /> Observation
              </p>
              <p className="text-xs text-zinc-400">{iteration.observation}</p>
            </div>
          )}
          {files.length > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-400 mb-1">Files Changed</p>
              <div className="flex flex-wrap gap-1">
                {files.map((f, i) => (
                  <span key={i} className="text-xs bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 font-mono">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
