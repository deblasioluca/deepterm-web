'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  AlertTriangle,
  User,
  Bot,
  Play,
  SkipForward,
  ExternalLink,
  GitPullRequest,
  TestTube,
  Rocket,
  FileText,
  MessageSquare,
  Zap,
  Brain,
  Vote,
  Shield,
  Mail,
  BookOpen,
  ArrowRight,
  Terminal,
  ChevronDown,
  RotateCcw,
  FastForward,
  Archive,
  Timer,
  Activity,
} from 'lucide-react';

// ── Types ──

type StepStatus = 'pending' | 'active' | 'passed' | 'failed' | 'skipped' | 'waiting_approval' | 'timeout';
type Actor = 'human' | 'ai' | 'system';

interface GateAction {
  label: string;
  action: string;
  variant: 'approve' | 'reject' | 'skip';
}

interface LifecycleEventEntry {
  id: string;
  stepId: string;
  event: string;
  detail?: string | null;
  actor: string;
  createdAt: string;
}

interface LifecycleStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  actor: Actor;
  status: StepStatus;
  detail?: string;
  link?: { url: string; label: string };
  gate?: {
    required: boolean;
    actions: GateAction[];
  };
  substeps?: { label: string; status: StepStatus }[];
  timestamp?: string;
  agentLoopId?: string | null;
  timeout?: number | null;         // seconds before warning
  startedAt?: string | null;       // ISO timestamp
  lastHeartbeat?: string | null;   // ISO timestamp
  events?: LifecycleEventEntry[];  // recent events for this step
}

// ── Status styles ──

const STATUS_CONFIG: Record<StepStatus, { bg: string; border: string; text: string; icon: React.ReactNode; ring?: string }> = {
  pending:           { bg: 'bg-zinc-800/50', border: 'border-zinc-700', text: 'text-zinc-500', icon: <Clock className="w-4 h-4 text-zinc-500" /> },
  active:            { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400', icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />, ring: 'ring-blue-500/30' },
  passed:            { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
  failed:            { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', icon: <XCircle className="w-4 h-4 text-red-400" />, ring: 'ring-red-500/30' },
  skipped:           { bg: 'bg-zinc-800/30', border: 'border-zinc-700/50', text: 'text-zinc-600', icon: <SkipForward className="w-4 h-4 text-zinc-600" /> },
  waiting_approval:  { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, ring: 'ring-amber-500/30' },
  timeout:           { bg: 'bg-orange-500/10', border: 'border-orange-500/50', text: 'text-orange-400', icon: <Timer className="w-4 h-4 text-orange-400" />, ring: 'ring-orange-500/30' },
};

const ACTOR_BADGE: Record<Actor, { label: string; style: string; icon: React.ReactNode }> = {
  human:  { label: 'You', style: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: <User className="w-3 h-3" /> },
  ai:     { label: 'AI', style: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: <Bot className="w-3 h-3" /> },
  system: { label: 'System', style: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: <Zap className="w-3 h-3" /> },
};

// ── Helpers ──

function formatElapsed(seconds: number): string {
  if (seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function getElapsedSeconds(startedAt?: string | null): number {
  if (!startedAt) return 0;
  return Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return iso; }
}

// ── Timeout Bar ──

function TimeoutBar({ elapsed, timeout }: { elapsed: number; timeout: number }) {
  const pct = Math.min((elapsed / timeout) * 100, 100);
  const isOver = elapsed >= timeout;
  const isWarning = pct > 70;

  return (
    <div className="mt-2">
      <div className="flex justify-between text-[10px] mb-1">
        <span className={isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-zinc-500'}>
          {isOver ? `\u26A0 Timeout exceeded (${formatElapsed(elapsed)} / ${formatElapsed(timeout)})` : `${formatElapsed(elapsed)} / ${formatElapsed(timeout)}`}
        </span>
        <span className="text-zinc-600">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{
            width: `${pct}%`,
            background: isOver
              ? 'linear-gradient(90deg, #ef4444, #f87171)'
              : isWarning
              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
              : 'linear-gradient(90deg, #3b82f6, #60a5fa)',
          }}
        />
      </div>
    </div>
  );
}

// ── Activity Log ──

function ActivityLogSection({ events, stepId }: { events: LifecycleEventEntry[]; stepId: string }) {
  const [expanded, setExpanded] = useState(false);
  const stepEvents = events.filter(e => e.stepId === stepId);
  if (stepEvents.length === 0) return null;

  const eventColors: Record<string, string> = {
    started: 'text-blue-400', completed: 'text-emerald-400', failed: 'text-red-400',
    progress: 'text-zinc-400', heartbeat: 'text-zinc-600', timeout: 'text-orange-400',
    cancelled: 'text-red-400', skipped: 'text-zinc-500', retried: 'text-amber-400', reset: 'text-amber-400',
  };

  return (
    <div className="mt-2">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition">
        <Activity className="w-3 h-3" />
        <span className={`inline-block transition-transform ${expanded ? 'rotate-90' : ''}`}><ChevronRight className="w-3 h-3" /></span>
        Activity Log ({stepEvents.length})
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-44 overflow-y-auto rounded-md border border-zinc-700/50 bg-zinc-900/80 p-2 space-y-0.5">
          {stepEvents.map((ev) => (
            <div key={ev.id} className="flex gap-2 text-[10px] font-mono leading-relaxed">
              <span className="text-zinc-600 shrink-0">{formatTime(ev.createdAt)}</span>
              <span className={eventColors[ev.event] || 'text-zinc-500'}>{ev.event}</span>
              {ev.detail && <span className="text-zinc-500 truncate">{ev.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recovery Actions ──

function RecoveryActions({ step, onAction }: {
  step: LifecycleStep;
  onAction: (stepId: string, action: string) => void;
}) {
  const actions: { label: string; action: string; color: string }[] = [];
  const s = step.status;

  // Active automated steps can be cancelled
  if ((s === 'active' || s === 'timeout') && (step.actor === 'ai' || step.actor === 'system')) {
    actions.push({ label: 'Cancel', action: 'cancel-step', color: 'text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20' });
  }

  // Timeout and failed steps can be retried or skipped
  if (s === 'timeout' || s === 'failed') {
    actions.push({ label: 'Retry', action: 'retry-step', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' });
    actions.push({ label: 'Skip \u2192', action: 'skip-step', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30 hover:bg-zinc-500/20' });
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex gap-1.5 mt-2 flex-wrap">
      {actions.map((a) => (
        <button
          key={a.action}
          onClick={() => onAction(step.id, a.action)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${a.color}`}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Global Story Actions ──

function GlobalActions({ storyId, onAction }: { storyId: string; onAction: (action: string) => void }) {
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  const handleClick = (action: string) => {
    if (action === 'reset-all' || action === 'force-complete') {
      if (showConfirm === action) {
        onAction(action);
        setShowConfirm(null);
      } else {
        setShowConfirm(action);
        setTimeout(() => setShowConfirm(null), 3000);
      }
    } else {
      onAction(action);
    }
  };

  return (
    <div className="flex gap-1.5 items-center flex-wrap p-2.5 bg-zinc-800/30 rounded-lg border border-zinc-700/40">
      <span className="text-[10px] text-zinc-500 font-medium mr-1">Story:</span>
      <button onClick={() => handleClick('reset-all')} className="px-2 py-0.5 rounded text-[10px] font-medium text-red-400 bg-red-500/8 border border-red-500/25 hover:bg-red-500/15 transition">
        {showConfirm === 'reset-all' ? '\u26A0 Confirm Reset?' : '\u21BA Reset to Start'}
      </button>
      <button onClick={() => handleClick('force-complete')} className="px-2 py-0.5 rounded text-[10px] font-medium text-zinc-400 bg-zinc-500/8 border border-zinc-500/25 hover:bg-zinc-500/15 transition">
        {showConfirm === 'force-complete' ? '\u26A0 Confirm?' : '\u23ED Force Complete'}
      </button>
    </div>
  );
}

// ── Connector ──

function StepConnector({ fromStatus }: { fromStatus: StepStatus }) {
  const color = fromStatus === 'passed' ? 'bg-emerald-500' : fromStatus === 'failed' ? 'bg-red-500' : fromStatus === 'timeout' ? 'bg-orange-500' : 'bg-zinc-700';
  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex flex-col items-center">
        <div className={`w-0.5 h-4 ${color}`} />
        <ArrowRight className={`w-3 h-3 rotate-90 ${fromStatus === 'passed' ? 'text-emerald-500' : fromStatus === 'failed' ? 'text-red-500' : 'text-zinc-700'}`} />
      </div>
    </div>
  );
}

// ── Agent Log Drill-down ──

function AgentDrillDown({ loopId }: { loopId: string }) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchLogs = async () => {
    if (data) { setExpanded(!expanded); return; }
    setExpanded(true);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/cockpit/agent-loop/${loopId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ok */ } finally { setLoading(false); }
  };

  return (
    <div className="mt-2">
      <button onClick={fetchLogs} className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition">
        <Terminal className="w-3 h-3" />
        {expanded ? 'Hide' : 'View'} Agent Logs
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-900/80 p-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</div>
          ) : !data ? (
            <p className="text-xs text-zinc-500">Failed to load agent logs</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Status: <span className={data.status === 'completed' ? 'text-emerald-400' : data.status === 'failed' ? 'text-red-400' : data.status === 'running' ? 'text-blue-400' : 'text-zinc-400'}>{data.status}</span></span>
                <span className="text-zinc-500">{data.iterations?.length || 0} iterations</span>
              </div>
              {data.errorLog && <p className="text-xs text-red-400 bg-red-500/10 rounded px-2 py-1">{data.errorLog}</p>}
              {(data.iterations || []).map((iter: any, i: number) => (
                <div key={i} className="border-l-2 border-zinc-700 pl-3 py-1">
                  <p className="text-[10px] text-zinc-500 font-mono">Iteration {iter.iteration}</p>
                  <p className="text-xs text-zinc-300 mt-0.5 line-clamp-2">{iter.thinking?.slice(0, 200)}{iter.thinking?.length > 200 ? '...' : ''}</p>
                  <p className="text-[10px] text-cyan-400/70 mt-0.5 font-mono truncate">{iter.action?.slice(0, 100)}</p>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Step Card with resilience features ──

function StepCard({ step, isLast, onGateAction }: {
  step: LifecycleStep;
  isLast: boolean;
  onGateAction: (stepId: string, action: string) => void;
}) {
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds(step.startedAt));

  // Live elapsed timer for active steps
  useEffect(() => {
    if (step.status !== 'active' && step.status !== 'timeout') return;
    const interval = setInterval(() => {
      setElapsed(getElapsedSeconds(step.startedAt));
    }, 1000);
    return () => clearInterval(interval);
  }, [step.status, step.startedAt]);

  // Determine effective status (timeout detection)
  const isTimedOut = step.timeout && step.status === 'active' && elapsed >= step.timeout;
  const effectiveStatus: StepStatus = isTimedOut ? 'timeout' : step.status;
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
  const actor = ACTOR_BADGE[step.actor];
  const isGate = step.status === 'waiting_approval' && step.gate;
  const hasRing = effectiveStatus === 'active' || effectiveStatus === 'waiting_approval' || effectiveStatus === 'timeout' || effectiveStatus === 'failed';

  return (
    <div className={`relative rounded-lg border p-3 transition-all ${cfg.bg} ${cfg.border} ${hasRing ? `ring-1 ring-offset-0 ${cfg.ring || ''}` : ''}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 mt-0.5 p-1.5 rounded-md ${cfg.bg} border ${cfg.border}`}>
          {step.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${cfg.text}`}>{step.label}</span>
            {cfg.icon}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${actor.style}`}>
              {actor.icon} {actor.label}
            </span>
            {/* Elapsed timer for active/timeout steps */}
            {(effectiveStatus === 'active' || effectiveStatus === 'timeout') && step.startedAt && (
              <span className="text-[10px] font-mono text-zinc-500">
                {formatElapsed(elapsed)}
              </span>
            )}
            {/* Status label */}
            <span className={`text-[10px] ${cfg.text}`}>
              {effectiveStatus === 'waiting_approval' ? 'Needs approval' : effectiveStatus === 'timeout' ? 'Timed out' : effectiveStatus}
            </span>
          </div>

          <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>

          {/* Detail text */}
          {step.detail && (
            <p className={`text-xs mt-1 ${effectiveStatus === 'failed' || effectiveStatus === 'timeout' ? 'text-red-400' : 'text-zinc-400'}`}>
              {step.detail}
            </p>
          )}

          {/* Timeout warning banner */}
          {isTimedOut && (
            <div className="mt-2 px-3 py-2 rounded-md bg-orange-500/10 border border-orange-500/30 text-[11px] text-orange-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                This step has exceeded its expected duration ({formatElapsed(step.timeout!)}). 
                It may be stuck. You can retry, skip, or cancel.
              </span>
            </div>
          )}

          {/* Substeps */}
          {step.substeps && step.substeps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {step.substeps.map((sub, i) => {
                const subCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${subCfg.bg} ${subCfg.border} ${subCfg.text}`}>
                    {subCfg.icon} {sub.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Timeout progress bar */}
          {step.timeout && (effectiveStatus === 'active' || effectiveStatus === 'timeout') && step.startedAt && (
            <TimeoutBar elapsed={elapsed} timeout={step.timeout} />
          )}

          {/* Link */}
          {step.link && (
            <a href={step.link.url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1">
              <ExternalLink className="w-3 h-3" /> {step.link.label}
            </a>
          )}

          {/* Gate actions */}
          {isGate && step.gate && (
            <GateButtons gate={step.gate} stepId={step.id} onGateAction={onGateAction} />
          )}

          {/* Recovery actions for timeout/failed (only if no gate buttons already) */}
          {!step.gate && <RecoveryActions step={{ ...step, status: effectiveStatus }} onAction={onGateAction} />}

          {/* Agent drill-down for Implement step */}
          {step.agentLoopId && (
            <AgentDrillDown loopId={step.agentLoopId} />
          )}

          {/* Activity log */}
          {step.events && step.events.length > 0 && (
            <ActivityLogSection events={step.events} stepId={step.id} />
          )}

          {/* Timestamp */}
          {step.timestamp && (
            <p className="text-[10px] text-zinc-600 mt-1">{step.timestamp}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Gate buttons ──

function GateButtons({ gate, stepId, onGateAction }: {
  gate: NonNullable<LifecycleStep['gate']>;
  stepId: string;
  onGateAction: (stepId: string, action: string) => void;
}) {
  const variants: Record<string, string> = {
    approve: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    reject: 'bg-red-600 hover:bg-red-500 text-white',
    skip: 'bg-zinc-600 hover:bg-zinc-500 text-zinc-200',
  };

  return (
    <div className="flex gap-2 mt-2">
      {gate.actions.map((a) => (
        <button
          key={a.action}
          onClick={() => onGateAction(stepId, a.action)}
          className={`px-3 py-1 rounded text-xs font-medium transition ${variants[a.variant] || variants.skip}`}
        >
          {a.variant === 'approve' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
          {a.variant === 'reject' && <XCircle className="w-3 h-3 inline mr-1" />}
          {a.variant === 'skip' && <SkipForward className="w-3 h-3 inline mr-1" />}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Substep status helper ──

function getSubstepStatus(current: string | null | undefined, passedPhases: string[]): StepStatus {
  if (!current || current === 'none') return 'pending';
  const idx = passedPhases.indexOf(current);
  if (idx === 0) return 'active';
  if (idx > 0) return 'passed';
  return 'pending';
}

function getDefaultSteps(): LifecycleStep[] {
  return [
    { id: 'triage', label: 'Triage', description: 'Select a story to see its lifecycle', icon: <Zap className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'planning', label: 'Plan', description: '', icon: <FileText className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'deliberation', label: 'AI Deliberation', description: '', icon: <Brain className="w-4 h-4" />, actor: 'ai', status: 'pending' },
    { id: 'implement', label: 'Implement', description: '', icon: <GitPullRequest className="w-4 h-4" />, actor: 'ai', status: 'pending' },
    { id: 'test', label: 'Test', description: '', icon: <TestTube className="w-4 h-4" />, actor: 'system', status: 'pending' },
    { id: 'review', label: 'Review & Merge', description: '', icon: <MessageSquare className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'deploy', label: 'Deploy', description: '', icon: <Rocket className="w-4 h-4" />, actor: 'system', status: 'pending' },
    { id: 'release', label: 'Release', description: '', icon: <Mail className="w-4 h-4" />, actor: 'system', status: 'pending' },
  ];
}

// ── Story lifecycle data shape ──

export interface StoryLifecycleData {
  id: string;
  title: string;
  status: string;
  epicId?: string | null;
  epicTitle?: string;
  triageApproved?: boolean | null;
  deliberationStatus?: string | null;
  deliberationId?: string | null;
  agentLoopStatus?: string | null;
  agentLoopId?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  prMerged?: boolean;
  testsPass?: boolean | null;
  e2ePass?: StepStatus;
  unitPass?: StepStatus;
  uiPass?: StepStatus;
  deployed?: boolean;
  released?: boolean;
  version?: string | null;
  releaseNotesDone?: boolean;
  emailSent?: boolean;
  docsUpdated?: boolean;
  // Resilience fields
  lifecycleStep?: string | null;
  lifecycleStartedAt?: string | null;
  lifecycleHeartbeat?: string | null;
  stepTimeouts?: Record<string, number | null>;
  recentEvents?: LifecycleEventEntry[];
}


// ── Event-based status overrides ──
// Bridge between lifecycle events (cancel, skip, retry, reset) and the derived step statuses.
// Without this, the UI derives status from story/deliberation/agentLoop data only,
// so recovery actions like Cancel have no visible effect.

function applyEventOverrides(steps: LifecycleStep[], events: LifecycleEventEntry[]): void {
  // Map step IDs (UI uses 'planning', events might use 'plan')
  const idMap: Record<string, string> = { plan: 'planning', planning: 'planning' };
  const normalize = (id: string) => idMap[id] || id;

  for (const step of steps) {
    // Find events for this step (events are chronological, oldest first)
    const stepEvents = events.filter(e => normalize(e.stepId) === step.id);
    if (stepEvents.length === 0) continue;

    const lastEvent = stepEvents[stepEvents.length - 1];

    switch (lastEvent.event) {
      case 'cancelled':
        // Only override if step was active/timeout — don't override passed/pending
        if (step.status === 'active' || step.status === 'timeout') {
          step.status = 'failed';
          step.detail = `Cancelled \u2014 ${lastEvent.detail || 'by operator'}`;
          step.gate = {
            required: false,
            actions: [
              { label: 'Retry Step', action: 'retry-step', variant: 'approve' },
              { label: 'Skip \u2192', action: 'skip-step', variant: 'skip' },
            ],
          };
        }
        break;

      case 'skipped':
        if (step.status !== 'passed') {
          step.status = 'skipped';
          step.detail = lastEvent.detail || 'Skipped by operator';
        }
        break;

      case 'retried':
        if (step.status !== 'passed') {
          step.status = 'active';
          step.detail = 'Retrying...';
          step.startedAt = lastEvent.createdAt;
        }
        break;

      case 'reset':
        if (step.status !== 'passed') {
          step.status = 'pending';
          step.detail = undefined;
        }
        break;

      case 'failed':
        if (step.status === 'active' || step.status === 'timeout') {
          step.status = 'failed';
          step.detail = lastEvent.detail || 'Step failed';
          if (!step.gate) {
            step.gate = {
              required: false,
              actions: [
                { label: 'Retry Step', action: 'retry-step', variant: 'approve' },
                { label: 'Skip \u2192', action: 'skip-step', variant: 'skip' },
              ],
            };
          }
        }
        break;

      case 'started':
        // A started event can activate a pending step (e.g. after skip of previous step)
        if (step.status === 'pending') {
          step.status = step.actor === 'human' ? 'waiting_approval' : 'active';
          step.startedAt = lastEvent.createdAt;
          step.detail = undefined;
          // Add default gate for human steps that got activated
          if (step.actor === 'human' && step.id === 'review') {
            step.gate = {
              required: true,
              actions: [
                { label: 'Approve & Merge', action: 'merge-pr', variant: 'approve' },
                { label: 'Request Changes', action: 'request-changes', variant: 'reject' },
              ],
            };
          }
        }
        break;

      case 'completed':
        // Override to passed if an event says so
        if (step.status !== 'passed') {
          step.status = 'passed';
          step.detail = lastEvent.detail || 'Completed';
        }
        break;
    }
  }

  // After overrides, fix downstream steps:
  // If a step was cancelled/failed, all subsequent active/waiting steps should be pending
  let blocked = false;
  for (const step of steps) {
    if (blocked && (step.status === 'active' || step.status === 'waiting_approval')) {
      step.status = 'pending';
      step.detail = undefined;
      step.gate = undefined;
    }
    if (step.status === 'failed' || step.status === 'skipped') {
      // Don't block downstream for skipped (it means we moved past it)
      if (step.status === 'failed') blocked = true;
    }
    // Reset block once we hit a passed step after a failed one (shouldn't happen normally)
    if (step.status === 'passed') blocked = false;
  }
}

// ── Build lifecycle steps from story data ──

function buildLifecycleSteps(story: StoryLifecycleData | null): LifecycleStep[] {
  if (!story) return getDefaultSteps();

  const s = story;
  const steps: LifecycleStep[] = [];
  const events = s.recentEvents || [];
  const timeouts = s.stepTimeouts || {};

  // Helper to get startedAt for a step
  const getStepStart = (stepId: string): string | null => {
    if (s.lifecycleStep === stepId && s.lifecycleStartedAt) return s.lifecycleStartedAt;
    const started = events.filter(e => e.stepId === stepId && e.event === 'started');
    return started.length > 0 ? started[started.length - 1].createdAt : null;
  };

  // 1. Triage
  const triageStatus: StepStatus = s.triageApproved === true ? 'passed' : s.triageApproved === false ? 'failed' : s.status === 'backlog' ? 'waiting_approval' : 'passed';
  steps.push({
    id: 'triage', label: 'Triage', description: 'Issue or idea reviewed and approved',
    icon: <Zap className="w-4 h-4" />, actor: 'human', status: triageStatus,
    detail: triageStatus === 'waiting_approval' ? 'Awaiting your approval in Triage queue' : undefined,
    events,
    gate: triageStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Approve', action: 'approve-triage', variant: 'approve' },
        { label: 'Reject', action: 'reject-triage', variant: 'reject' },
        { label: 'Defer', action: 'defer-triage', variant: 'skip' },
      ],
    } : undefined,
  });

  // 2. Planning
  const planStatus: StepStatus = s.epicId ? 'passed' : triageStatus === 'passed' ? 'active' : 'pending';
  steps.push({
    id: 'planning', label: 'Plan', description: 'Create epic & stories, set priority',
    icon: <FileText className="w-4 h-4" />, actor: 'human', status: planStatus,
    detail: s.epicId ? `Epic: ${s.epicTitle || s.epicId}` : undefined,
    events,
  });

  // 3. AI Deliberation
  const delibPhase = s.deliberationStatus;
  let delibStatus: StepStatus = 'pending';
  if (delibPhase === 'decided') delibStatus = 'passed';
  else if (delibPhase === 'failed') delibStatus = 'failed';
  else if (delibPhase && delibPhase !== 'none') delibStatus = 'active';
  else if (planStatus === 'passed') delibStatus = 'waiting_approval';

  const delibSubsteps = [
    { label: 'Propose', status: getSubstepStatus(delibPhase, ['proposing', 'debating', 'voting', 'decided', 'implementing']) },
    { label: 'Debate', status: getSubstepStatus(delibPhase, ['debating', 'voting', 'decided', 'implementing']) },
    { label: 'Vote', status: getSubstepStatus(delibPhase, ['voting', 'decided', 'implementing']) },
    { label: 'Decide', status: getSubstepStatus(delibPhase, ['decided', 'implementing']) },
  ];
  if (delibStatus === 'passed') {
    delibSubsteps.forEach(s => s.status = 'passed');
  }

  steps.push({
    id: 'deliberation', label: 'AI Deliberation', description: '4 AI agents propose, debate, vote on architecture',
    icon: <Brain className="w-4 h-4" />, actor: 'ai', status: delibStatus,
    substeps: delibStatus !== 'pending' && delibStatus !== 'waiting_approval' ? delibSubsteps : undefined,
    detail: delibStatus === 'failed' ? 'Deliberation failed \u2014 retry or skip' : undefined,
    timeout: timeouts.deliberation ?? 300,
    startedAt: delibStatus === 'active' ? getStepStart('deliberation') : null,
    events,
    gate: delibStatus === 'waiting_approval' ? {
      required: false,
      actions: [
        { label: 'Start Deliberation', action: 'start-deliberation', variant: 'approve' },
        { label: 'Skip', action: 'skip-deliberation', variant: 'skip' },
      ],
    } : delibStatus === 'failed' ? {
      required: false,
      actions: [
        { label: 'Restart Deliberation', action: 'restart-deliberation', variant: 'approve' },
        { label: 'Skip', action: 'skip-deliberation', variant: 'skip' },
      ],
    } : undefined,
  });

  // 4. Implementation (Agent Loop -> PR)
  const implStatus: StepStatus = s.prNumber ? 'passed' : s.agentLoopStatus === 'running' ? 'active' : s.agentLoopStatus === 'failed' ? 'failed' : (delibStatus === 'passed' && delibPhase === 'decided') ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'implement', label: 'Implement', description: 'AI agent writes code and creates PR',
    agentLoopId: s.agentLoopId || null,
    icon: <GitPullRequest className="w-4 h-4" />, actor: 'ai', status: implStatus,
    detail: s.prNumber ? `PR #${s.prNumber}` : s.agentLoopStatus === 'running' ? 'Agent coding...' : s.agentLoopStatus === 'failed' ? 'Agent failed \u2014 fix & retry' : undefined,
    link: s.prUrl ? { url: s.prUrl, label: `PR #${s.prNumber}` } : undefined,
    timeout: timeouts.implement ?? 600,
    startedAt: implStatus === 'active' ? getStepStart('implement') : null,
    events,
    gate: implStatus === 'waiting_approval' ? {
      required: false,
      actions: [
        { label: 'Start Agent', action: 'start-agent', variant: 'approve' },
        { label: 'Manual PR', action: 'manual-pr', variant: 'skip' },
      ],
    } : implStatus === 'failed' ? {
      required: false,
      actions: [
        { label: 'Retry Agent', action: 'retry-agent', variant: 'approve' },
        { label: 'Manual Fix', action: 'manual-fix', variant: 'skip' },
      ],
    } : undefined,
  });

  // 5. Test (CI runs on the PR before merge)
  const testStatus: StepStatus = s.testsPass === true ? 'passed' : s.testsPass === false ? 'failed' : s.prNumber ? 'active' : 'pending';
  steps.push({
    id: 'test', label: 'Test', description: 'CI runs on PR: E2E + unit + UI tests',
    icon: <TestTube className="w-4 h-4" />, actor: 'system', status: testStatus,
    substeps: s.prNumber ? [
      { label: 'E2E (Playwright)', status: s.e2ePass ?? 'pending' as StepStatus },
      { label: 'Unit Tests', status: s.unitPass ?? 'pending' as StepStatus },
      { label: 'UI Tests', status: s.uiPass ?? 'pending' as StepStatus },
    ] : undefined,
    detail: testStatus === 'failed' ? 'Tests failed \u2014 fix required before merge' : undefined,
    timeout: timeouts.test ?? 300,
    startedAt: testStatus === 'active' ? getStepStart('test') : null,
    events,
    gate: testStatus === 'failed' ? {
      required: false,
      actions: [
        { label: 'Back to Implement', action: 'back-to-implement', variant: 'reject' },
        { label: 'Force Continue', action: 'force-continue', variant: 'skip' },
      ],
    } : undefined,
  });

  // 6. Review & Merge (after tests pass)
  const reviewStatus: StepStatus = s.prMerged ? 'passed' : (testStatus === 'passed' && s.prNumber) ? 'waiting_approval' : s.prNumber ? 'pending' : 'pending';
  steps.push({
    id: 'review', label: 'Review & Merge', description: 'Review diff, approve and merge after tests pass',
    icon: <MessageSquare className="w-4 h-4" />, actor: 'human', status: reviewStatus,
    link: s.prUrl ? { url: s.prUrl, label: 'View in Pull Requests tab' } : undefined,
    detail: reviewStatus === 'pending' && s.prNumber ? 'Waiting for tests to pass' : undefined,
    events,
    gate: reviewStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Approve & Merge', action: 'merge-pr', variant: 'approve' },
        { label: 'Request Changes', action: 'request-changes', variant: 'reject' },
      ],
    } : undefined,
  });

  // 7. Deploy
  const deployStatus: StepStatus = s.deployed ? 'passed' : (reviewStatus === 'passed' && s.prMerged) ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'deploy', label: 'Deploy', description: 'Build, sign, notarize, deploy to production',
    icon: <Rocket className="w-4 h-4" />, actor: 'system', status: deployStatus,
    detail: s.deployed ? `v${s.version || '?'}` : undefined,
    timeout: timeouts.deploy ?? 600,
    startedAt: (deployStatus as string) === 'active' ? getStepStart('deploy') : null,
    events,
    gate: deployStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Deploy Release', action: 'deploy-release', variant: 'approve' },
        { label: 'Hold', action: 'hold-deploy', variant: 'skip' },
      ],
    } : undefined,
  });

  // 8. Release
  const releaseStatus: StepStatus = s.released ? 'passed' : s.deployed ? 'active' : 'pending';
  steps.push({
    id: 'release', label: 'Release', description: 'Release notes, email users, update docs',
    icon: <Mail className="w-4 h-4" />, actor: 'system', status: releaseStatus,
    substeps: s.deployed ? [
      { label: 'Release Notes', status: s.releaseNotesDone ? 'passed' : 'pending' as StepStatus },
      { label: 'Email Users', status: s.emailSent ? 'passed' : 'pending' as StepStatus },
      { label: 'Update Docs', status: s.docsUpdated ? 'passed' : 'pending' as StepStatus },
    ] : undefined,
    timeout: timeouts.release ?? 120,
    startedAt: (releaseStatus as string) === 'active' ? getStepStart('release') : null,
    events,
  });

  // Apply lifecycle event overrides (cancel, skip, retry, reset)
  applyEventOverrides(steps, events);

  return steps;
}

// ── Progress summary bar ──

function ProgressSummary({ steps }: { steps: LifecycleStep[] }) {
  const total = steps.length;
  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const active = steps.filter(s => s.status === 'active' || s.status === 'waiting_approval').length;
  const pct = Math.round((passed / total) * 100);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-zinc-400">
          {passed}/{total} steps complete
          {failed > 0 && <span className="text-red-400 ml-2">({failed} failed)</span>}
          {active > 0 && <span className="text-amber-400 ml-2">({active} need attention)</span>}
        </span>
        <span className="text-zinc-500">{pct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
        {steps.map((step, i) => {
          const color = step.status === 'passed' ? 'bg-emerald-500' :
                        step.status === 'failed' ? 'bg-red-500' :
                        step.status === 'active' ? 'bg-blue-500' :
                        step.status === 'waiting_approval' ? 'bg-amber-500' :
                        step.status === 'skipped' ? 'bg-zinc-600' : 'bg-zinc-800';
          return <div key={i} className={`h-full ${color}`} style={{ width: `${100 / steps.length}%` }} />;
        })}
      </div>
    </div>
  );
}

// ── Main exported component ──

interface DevLifecycleFlowProps {
  story?: StoryLifecycleData | null;
  stories?: StoryLifecycleData[];
  onGateAction?: (stepId: string, action: string, storyId?: string) => void;
  onSelectStory?: (storyId: string) => void;
}

export default function DevLifecycleFlow({ story, stories, onGateAction, onSelectStory }: DevLifecycleFlowProps) {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(story?.id || null);
  const activeStory = story || stories?.find(s => s.id === selectedStoryId) || null;
  const steps = buildLifecycleSteps(activeStory);

  const handleGateAction = (stepId: string, action: string) => {
    onGateAction?.(stepId, action, activeStory?.id);
  };

  const handleGlobalAction = (action: string) => {
    if (activeStory) {
      onGateAction?.('global', action, activeStory.id);
    }
  };

  const handleSelectStory = (id: string) => {
    setSelectedStoryId(id);
    onSelectStory?.(id);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Development Lifecycle
          </h3>
          {activeStory && (
            <p className="text-xs text-zinc-500 mt-0.5">{activeStory.title}</p>
          )}
        </div>
        {/* Legend */}
        <div className="flex gap-3 text-[10px]">
          {(['human', 'ai', 'system'] as Actor[]).map(a => {
            const badge = ACTOR_BADGE[a];
            return (
              <span key={a} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${badge.style}`}>
                {badge.icon} {badge.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Story selector */}
      {stories && stories.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {stories.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelectStory(s.id)}
              className={`px-2 py-1 rounded text-xs border transition ${
                s.id === selectedStoryId
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {s.title.length > 40 ? s.title.substring(0, 40) + '...' : s.title}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <ProgressSummary steps={steps} />

      {/* Global actions */}
      {activeStory && (
        <GlobalActions storyId={activeStory.id} onAction={handleGlobalAction} />
      )}

      {/* Step cards with connectors */}
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={step.id}>
            <StepCard step={step} isLast={i === steps.length - 1} onGateAction={handleGateAction} />
            {i < steps.length - 1 && (
              <StepConnector fromStatus={step.status} />
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!activeStory && !stories?.length && (
        <div className="text-center py-8 text-zinc-600 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Select a story from Planning to track its lifecycle
        </div>
      )}
    </div>
  );
}
