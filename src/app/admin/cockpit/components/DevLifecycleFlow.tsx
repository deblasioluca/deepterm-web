'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CheckCircle2, XCircle, Clock, Loader2, ChevronRight, AlertTriangle,
  User, Bot, Play, SkipForward, ExternalLink, GitPullRequest, TestTube,
  Rocket, FileText, MessageSquare, Zap, Brain, Vote, Shield, Mail,
  BookOpen, ArrowRight, Terminal, ChevronDown, RotateCcw, FastForward,
  Archive, Timer, Activity, RefreshCcw, Send, ArrowLeft, Trash2,
} from 'lucide-react';
import LoopHistoryPanel from './LoopHistoryPanel';
import FeedbackDialog, { type FeedbackTarget } from './FeedbackDialog';
import TestProgressPanel from './TestProgressPanel';

// ── Types ──

type StepStatus = 'pending' | 'active' | 'passed' | 'failed' | 'skipped' | 'waiting_approval' | 'timeout';
type Actor = 'human' | 'ai' | 'system';

interface GateAction {
  label: string;
  action: string;
  variant: 'approve' | 'reject' | 'skip' | 'loop';
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
  gate?: { required: boolean; actions: GateAction[] };
  substeps?: { label: string; status: StepStatus }[];
  timestamp?: string;
  agentLoopId?: string | null;
  timeout?: number | null;
  startedAt?: string | null;
  lastHeartbeat?: string | null;
  events?: LifecycleEventEntry[];
}

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
  lifecycleStep?: string | null;
  lifecycleStartedAt?: string | null;
  lifecycleHeartbeat?: string | null;
  stepTimeouts?: Record<string, number | null>;
  recentEvents?: LifecycleEventEntry[];
  scope?: string;
  loopCount?: number;
  maxLoops?: number;
  lastLoopFrom?: string | null;
  lastLoopTo?: string | null;
  stepETAs?: Record<string, { p50: number; p90: number; count: number }>;
  lifecycleTemplate?: string;
  lifecycleTemplateSteps?: string[];
}

// ── Status styles ──

const STATUS_CONFIG: Record<StepStatus, { bg: string; border: string; text: string; icon: React.ReactNode; ring?: string; dot: string }> = {
  pending:          { bg: 'bg-zinc-800/50', border: 'border-zinc-700', text: 'text-zinc-500', icon: <Clock className="w-3.5 h-3.5 text-zinc-500" />, dot: 'bg-zinc-600' },
  active:           { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400', icon: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />, ring: 'ring-blue-500/30', dot: 'bg-blue-500' },
  passed:           { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, dot: 'bg-emerald-500' },
  failed:           { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', icon: <XCircle className="w-3.5 h-3.5 text-red-400" />, ring: 'ring-red-500/30', dot: 'bg-red-500' },
  skipped:          { bg: 'bg-zinc-800/30', border: 'border-zinc-700/50', text: 'text-zinc-600', icon: <SkipForward className="w-3.5 h-3.5 text-zinc-600" />, dot: 'bg-zinc-700' },
  waiting_approval: { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />, ring: 'ring-amber-500/30', dot: 'bg-amber-500' },
  timeout:          { bg: 'bg-orange-500/10', border: 'border-orange-500/50', text: 'text-orange-400', icon: <Timer className="w-3.5 h-3.5 text-orange-400" />, ring: 'ring-orange-500/30', dot: 'bg-orange-500' },
};

const ACTOR_BADGE: Record<Actor, { label: string; style: string; icon: React.ReactNode }> = {
  human:  { label: 'You', style: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: <User className="w-2.5 h-2.5" /> },
  ai:     { label: 'AI', style: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: <Bot className="w-2.5 h-2.5" /> },
  system: { label: 'System', style: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: <Zap className="w-2.5 h-2.5" /> },
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
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
}

function formatTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return iso; }
}

function getSubstepStatus(current: string | null | undefined, passedPhases: string[]): StepStatus {
  if (!current || current === 'none') return 'pending';
  const idx = passedPhases.indexOf(current);
  if (idx === 0) return 'active';
  if (idx > 0) return 'passed';
  return 'pending';
}

// ── Timeout Bar (compact) ──

function TimeoutBar({ elapsed, timeout }: { elapsed: number; timeout: number }) {
  const pct = Math.min((elapsed / timeout) * 100, 100);
  const isOver = elapsed >= timeout;
  const isWarning = pct > 70;
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className={isOver ? 'text-red-400' : isWarning ? 'text-amber-400' : 'text-zinc-500'}>
          {isOver ? `⚠ ${formatElapsed(elapsed)} / ${formatElapsed(timeout)}` : `${formatElapsed(elapsed)} / ${formatElapsed(timeout)}`}
        </span>
        <span className="text-zinc-600">{Math.round(pct)}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-1000" style={{
          width: `${pct}%`,
          background: isOver ? 'linear-gradient(90deg,#ef4444,#f87171)' : isWarning ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#3b82f6,#60a5fa)',
        }} />
      </div>
    </div>
  );
}

// ── Activity Log (for detail panel) ──

function ActivityLog({ events, stepId }: { events: LifecycleEventEntry[]; stepId: string }) {
  const stepEvents = events.filter(e => e.stepId === stepId || (stepId === 'planning' && e.stepId === 'plan'));
  if (stepEvents.length === 0) return <p className="text-[11px] text-zinc-600">No events recorded yet.</p>;

  const eventColors: Record<string, string> = {
    started: 'text-blue-400', completed: 'text-emerald-400', failed: 'text-red-400',
    progress: 'text-zinc-400', heartbeat: 'text-zinc-600', timeout: 'text-orange-400',
    cancelled: 'text-red-400', skipped: 'text-zinc-500', retried: 'text-amber-400',
    reset: 'text-amber-400', 'loop-back': 'text-amber-400',
  };

  return (
    <div className="max-h-52 overflow-y-auto rounded-md border border-zinc-700/50 bg-zinc-900/80 p-2 space-y-0.5">
      {stepEvents.map((ev) => (
        <div key={ev.id} className="flex gap-2 text-[10px] font-mono leading-relaxed">
          <span className="text-zinc-600 shrink-0">{formatTime(ev.createdAt)}</span>
          <span className={eventColors[ev.event] || 'text-zinc-500'}>{ev.event}</span>
          {ev.detail && <span className="text-zinc-500 truncate">{ev.detail}</span>}
        </div>
      ))}
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
    setExpanded(true); setLoading(true);
    try {
      const res = await fetch(`/api/admin/cockpit/agent-loop/${loopId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ok */ } finally { setLoading(false); }
  };

  return (
    <div className="mt-2">
      <button onClick={fetchLogs} className="inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:text-cyan-300 transition">
        <Terminal className="w-3 h-3" />
        {expanded ? 'Hide' : 'View'} Agent Logs
        <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-56 overflow-y-auto rounded-lg border border-zinc-700/50 bg-zinc-900/80 p-3 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</div>
          ) : !data ? (
            <p className="text-xs text-zinc-500">Failed to load agent logs</p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-400">Status: <span className={data.status === 'completed' ? 'text-emerald-400' : data.status === 'failed' ? 'text-red-400' : 'text-blue-400'}>{data.status}</span></span>
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

// ── Compact Step Card (48px collapsed, expandable) ──

function CompactStepCard({ step, index, isSelected, onSelect, onGateAction, loopBadge }: {
  step: LifecycleStep;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onGateAction: (stepId: string, action: string) => void;
  loopBadge?: { from: number; to: number } | null;
}) {
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds(step.startedAt));

  useEffect(() => {
    if (step.status !== 'active' && step.status !== 'timeout') return;
    const interval = setInterval(() => setElapsed(getElapsedSeconds(step.startedAt)), 1000);
    return () => clearInterval(interval);
  }, [step.status, step.startedAt]);

  const isTimedOut = step.timeout && step.status === 'active' && elapsed >= step.timeout;
  const effectiveStatus: StepStatus = isTimedOut ? 'timeout' : step.status;
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;
  const actor = ACTOR_BADGE[step.actor];
  const isInteractive = effectiveStatus !== 'pending';

  return (
    <div
      onClick={isInteractive ? onSelect : undefined}
      className={`relative rounded-lg border transition-all ${
        isSelected
          ? `${cfg.bg} ${cfg.border} ring-1 ring-offset-0 ${cfg.ring || 'ring-zinc-600/50'}`
          : `${cfg.bg} ${cfg.border} ${isInteractive ? 'cursor-pointer hover:border-zinc-600' : 'opacity-60'}`
      }`}
    >
      {/* Step number dot */}
      <div className={`absolute -left-2.5 top-3.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-zinc-900 ${cfg.dot}`}>
        {effectiveStatus === 'passed' ? '✓' : index + 1}
      </div>

      <div className="py-2 px-3 pl-5">
        {/* Main row — always visible */}
        <div className="flex items-center gap-2 min-h-[24px]">
          {cfg.icon}
          <span className={`font-medium text-xs ${cfg.text} truncate`}>{step.label}</span>
          <span className={`inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium border ${actor.style}`}>
            {actor.icon} {actor.label}
          </span>
          {(effectiveStatus === 'active' || effectiveStatus === 'timeout') && step.startedAt && (
            <span className="text-[10px] font-mono text-zinc-500">{formatElapsed(elapsed)}</span>
          )}
          {/* Loop badge */}
          {loopBadge && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded text-[9px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <RefreshCcw className="w-2.5 h-2.5" /> {loopBadge.from}/{loopBadge.to}
            </span>
          )}
          {/* Right-align status label */}
          <span className={`text-[10px] ${cfg.text} ml-auto whitespace-nowrap`}>
            {effectiveStatus === 'waiting_approval' ? 'needs action' : effectiveStatus === 'timeout' ? 'timed out' : effectiveStatus}
          </span>
        </div>

        {/* Detail line */}
        {step.detail && (
          <p className={`text-[11px] mt-0.5 truncate ${effectiveStatus === 'failed' || effectiveStatus === 'timeout' ? 'text-red-400/80' : 'text-zinc-500'}`}>
            {step.detail}
          </p>
        )}

        {/* Potential loop indicators — always visible on Test & Review cards */}
        {step.id === 'test' && effectiveStatus !== 'pending' && (
          <div className="flex gap-2 mt-1 text-[9px] text-zinc-600">
            <span className="inline-flex items-center gap-0.5">
              <RefreshCcw className="w-2 h-2" /> \u2192 Implement
            </span>
            <span className="inline-flex items-center gap-0.5">
              <RefreshCcw className="w-2 h-2" /> \u2192 Deliberation
            </span>
          </div>
        )}
        {step.id === 'review' && effectiveStatus !== 'pending' && (
          <div className="flex gap-2 mt-1 text-[9px] text-zinc-600">
            <span className="inline-flex items-center gap-0.5">
              <RefreshCcw className="w-2 h-2" /> \u2192 Implement
            </span>
            <span className="inline-flex items-center gap-0.5">
              <RefreshCcw className="w-2 h-2" /> \u2192 Deliberation
            </span>
            <span className="inline-flex items-center gap-0.5 text-red-800">
              <Trash2 className="w-2 h-2" /> Abandon
            </span>
          </div>
        )}

        {/* Substep pills (compact) */}
        {step.substeps && effectiveStatus !== 'pending' && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {step.substeps.map((sub, i) => {
              const subCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
              return (
                <span key={i} className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] border ${subCfg.bg} ${subCfg.border} ${subCfg.text}`}>
                  {sub.status === 'passed' ? '✓' : sub.status === 'active' ? '◌' : '·'} {sub.label}
                </span>
              );
            })}
          </div>
        )}

        {/* Timeout bar (inline for compact view) */}
        {step.timeout && (effectiveStatus === 'active' || effectiveStatus === 'timeout') && step.startedAt && (
          <TimeoutBar elapsed={elapsed} timeout={step.timeout} />
        )}
      </div>
    </div>
  );
}

// ── Connector line between steps ──

function StepConnector({ fromStatus }: { fromStatus: StepStatus }) {
  const color = fromStatus === 'passed' ? 'bg-emerald-500' : fromStatus === 'failed' ? 'bg-red-500' : fromStatus === 'timeout' ? 'bg-orange-500' : 'bg-zinc-700';
  return (
    <div className="flex items-center justify-center py-0.5">
      <div className={`w-0.5 h-3 ${color}`} />
    </div>
  );
}

// ── SVG Loop Arrows (rendered alongside step list) ──

interface LoopArrowData {
  fromStepIdx: number;
  toStepIdx: number;
  label: string;
  count: number;
  maxLoops: number;
  color: string;
}

function parseLoopArrows(events: LifecycleEventEntry[], maxLoops: number): LoopArrowData[] {
  const STEP_ORDER = ['triage', 'planning', 'deliberation', 'implement', 'test', 'review', 'deploy', 'release'];
  const loopEvents = events.filter(e => e.event === 'loop-back');
  const grouped: Record<string, { count: number; label: string }> = {};

  for (const ev of loopEvents) {
    try {
      const d = JSON.parse(ev.detail || '{}');
      const from = d.from || '';
      const to = d.to || '';
      const key = `${from}->${to}`;
      if (!grouped[key]) grouped[key] = { count: 0, label: '' };
      grouped[key].count++;
      grouped[key].label = from === 'test' ? 'test failed' : from === 'review' ? 'changes requested' : 'loop';
    } catch { /* skip */ }
  }

  const arrows: LoopArrowData[] = [];
  for (const [key, val] of Object.entries(grouped)) {
    const [from, to] = key.split('->');
    const fromIdx = STEP_ORDER.indexOf(from);
    const toIdx = STEP_ORDER.indexOf(to);
    if (fromIdx >= 0 && toIdx >= 0 && fromIdx > toIdx) {
      arrows.push({
        fromStepIdx: fromIdx,
        toStepIdx: toIdx,
        label: `${val.label} \u2192 retry`,
        count: val.count,
        maxLoops,
        color: from === 'test' ? '#f59e0b' : '#ef4444',
      });
    }
  }
  return arrows;
}

function LoopArrowsSVG({ arrows, stepCount }: { arrows: LoopArrowData[]; stepCount: number }) {
  if (arrows.length === 0) return null;

  // Each step card is ~52px + 16px connector = ~68px per step slot
  const stepHeight = 68;
  const svgHeight = stepCount * stepHeight;
  const svgWidth = 64;

  return (
    <div className="absolute right-0 top-0 pointer-events-none" style={{ width: svgWidth, height: svgHeight }}>
      <svg width={svgWidth} height={svgHeight} className="overflow-visible">
        {arrows.map((arrow, i) => {
          const fromY = arrow.fromStepIdx * stepHeight + 26;
          const toY = arrow.toStepIdx * stepHeight + 26;
          const xOffset = 12 + i * 16; // stagger multiple arrows
          const midX = svgWidth - xOffset;

          // Curved path: from step -> curve right -> go up -> curve left -> to step
          const path = `M 0 ${fromY} C ${midX} ${fromY}, ${midX} ${fromY}, ${midX} ${fromY - 12} L ${midX} ${toY + 12} C ${midX} ${toY}, ${midX} ${toY}, 0 ${toY}`;

          return (
            <g key={`${arrow.fromStepIdx}-${arrow.toStepIdx}-${i}`}>
              <path
                d={path}
                fill="none"
                stroke={arrow.color}
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity="0.5"
              />
              {/* Arrow head */}
              <polygon
                points={`0,${toY} 6,${toY - 4} 6,${toY + 4}`}
                fill={arrow.color}
                opacity="0.7"
              />
              {/* Count badge */}
              <g transform={`translate(${midX - 10}, ${(fromY + toY) / 2 - 7})`}>
                <rect x="0" y="0" width="20" height="14" rx="3" fill={arrow.color} opacity="0.2" />
                <text x="10" y="10" textAnchor="middle" fontSize="8" fontWeight="600" fill={arrow.color} opacity="0.9">
                  {arrow.count}/{arrow.maxLoops}
                </text>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── Detail Panel (right column) ──

function DetailPanel({ step, allEvents, onGateAction, story }: {
  step: LifecycleStep;
  allEvents: LifecycleEventEntry[];
  onGateAction: (stepId: string, action: string) => void;
  story: StoryLifecycleData;
}) {
  const [elapsed, setElapsed] = useState(() => getElapsedSeconds(step.startedAt));
  const effectiveStatus: StepStatus = (step.timeout && step.status === 'active' && elapsed >= step.timeout) ? 'timeout' : step.status;
  const cfg = STATUS_CONFIG[effectiveStatus] || STATUS_CONFIG.pending;

  useEffect(() => {
    if (step.status !== 'active' && step.status !== 'timeout') return;
    const interval = setInterval(() => setElapsed(getElapsedSeconds(step.startedAt)), 1000);
    return () => clearInterval(interval);
  }, [step.status, step.startedAt]);

  // Heartbeat staleness check
  const heartbeatStale = step.lastHeartbeat
    ? (Date.now() - new Date(step.lastHeartbeat).getTime()) > 90000
    : false;

  return (
    <div className="space-y-3">
      {/* Step header */}
      <div className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-center gap-2 mb-1">
          {step.icon}
          <h4 className={`font-semibold text-sm ${cfg.text}`}>{step.label}</h4>
          <span className={`text-[10px] ${cfg.text} ml-auto`}>{effectiveStatus}</span>
        </div>
        <p className="text-xs text-zinc-500">{step.description}</p>
        {step.detail && (
          <p className={`text-xs mt-1 ${effectiveStatus === 'failed' ? 'text-red-400' : 'text-zinc-400'}`}>{step.detail}</p>
        )}
        {step.link && (
          <a href={step.link.url} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1">
            <ExternalLink className="w-3 h-3" /> {step.link.label}
          </a>
        )}
      </div>

      {/* ETA estimate */}
      {step.status === 'active' && story.stepETAs?.[step.id] && (
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-1">
          <Timer className="w-3 h-3" />
          <span>Typically {formatElapsed(story.stepETAs[step.id].p50)}–{formatElapsed(story.stepETAs[step.id].p90)} ({story.stepETAs[step.id].count} samples)</span>
        </div>
      )}

      {/* Heartbeat staleness warning */}
      {heartbeatStale && (step.status === 'active' || step.status === 'timeout') && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-orange-500/8 border border-orange-500/20 text-[11px] text-orange-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>No heartbeat for 90+ seconds. This step may be stuck.</span>
        </div>
      )}

      {/* Timeout warning */}
      {effectiveStatus === 'timeout' && step.timeout && (
        <div className="flex items-start gap-2 p-2.5 rounded-md bg-orange-500/8 border border-orange-500/20 text-[11px] text-orange-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>Exceeded expected duration ({formatElapsed(step.timeout)}). Consider retrying, skipping, or cancelling.</span>
        </div>
      )}

      {/* Substeps (expanded) */}
      {step.substeps && step.substeps.length > 0 && (
        <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3">
          <h5 className="text-[11px] font-medium text-zinc-400 mb-2">Sub-steps</h5>
          <div className="space-y-1.5">
            {step.substeps.map((sub, i) => {
              const subCfg = STATUS_CONFIG[sub.status] || STATUS_CONFIG.pending;
              return (
                <div key={i} className="flex items-center gap-2">
                  {subCfg.icon}
                  <span className={`text-xs ${subCfg.text}`}>{sub.label}</span>
                  <span className={`text-[10px] ${subCfg.text} ml-auto`}>{sub.status}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Test progress panel (replaces generic substeps for test step) */}
      {step.id === 'test' && story.id && (step.status === 'active' || step.status === 'failed' || step.status === 'passed' || step.status === 'timeout') && (
        <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3">
          <h5 className="text-[11px] font-medium text-zinc-400 mb-2 flex items-center gap-1">
            <TestTube className="w-3 h-3" /> Test Progress
          </h5>
          <TestProgressPanel
            storyId={story.id}
            scope={(story.scope as 'app' | 'web' | 'both') || 'app'}
            startedAt={step.startedAt}
            onLoopBack={(action, reason) => onGateAction(step.id, action)}
          />
        </div>
      )}

      {/* Gate actions */}
      {step.gate && (
        <GateButtons gate={step.gate} stepId={step.id} onGateAction={onGateAction} />
      )}

      {/* Recovery actions (if no gate) */}
      {!step.gate && <RecoveryActions step={{ ...step, status: effectiveStatus }} onAction={onGateAction} />}

      {/* Agent drill-down */}
      {step.agentLoopId && <AgentDrillDown loopId={step.agentLoopId} />}

      {/* Activity log */}
      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-3">
        <h5 className="text-[11px] font-medium text-zinc-400 mb-2 flex items-center gap-1">
          <Activity className="w-3 h-3" /> Activity Log
        </h5>
        <ActivityLog events={allEvents} stepId={step.id} />
      </div>
    </div>
  );
}

// ── Gate Buttons ──

function GateButtons({ gate, stepId, onGateAction }: {
  gate: NonNullable<LifecycleStep['gate']>;
  stepId: string;
  onGateAction: (stepId: string, action: string) => void;
}) {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const variants: Record<string, string> = {
    approve: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    reject: 'bg-red-600 hover:bg-red-500 text-white',
    skip: 'bg-zinc-600 hover:bg-zinc-500 text-zinc-200',
    loop: 'bg-amber-600 hover:bg-amber-500 text-white',
  };

  const handleAction = async (action: string) => {
    setLoadingAction(action);
    setError(null);
    try {
      onGateAction(stepId, action);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setTimeout(() => setLoadingAction(null), 500);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-2 px-2.5 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 flex items-center gap-1.5">
          <XCircle className="w-3 h-3 shrink-0" /> {error}
        </div>
      )}
      <div className="flex gap-2 flex-wrap">
        {gate.actions.map((a) => (
          <button
            key={a.action}
            onClick={() => handleAction(a.action)}
            disabled={loadingAction !== null}
            className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1 disabled:opacity-50 ${variants[a.variant] || variants.skip}`}
          >
            {loadingAction === a.action ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : a.variant === 'approve' ? (
              <CheckCircle2 className="w-3 h-3" />
            ) : a.variant === 'reject' ? (
              <XCircle className="w-3 h-3" />
            ) : a.variant === 'loop' ? (
              <RefreshCcw className="w-3 h-3" />
            ) : (
              <SkipForward className="w-3 h-3" />
            )}
            {a.label}
          </button>
        ))}
      </div>
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

  if ((s === 'active' || s === 'timeout') && (step.actor === 'ai' || step.actor === 'system')) {
    actions.push({ label: 'Cancel', action: 'cancel-step', color: 'text-red-400 bg-red-500/10 border-red-500/30 hover:bg-red-500/20' });
  }
  if (s === 'timeout' || s === 'failed') {
    // Step-specific loop-back actions for test failures
    if (step.id === 'test') {
      actions.push({ label: 'Auto-fix (AI)', action: 'loop-test-to-implement', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20' });
      actions.push({ label: 'Back to Deliberation', action: 'loop-test-to-deliberation', color: 'text-purple-400 bg-purple-500/10 border-purple-500/30 hover:bg-purple-500/20' });
    }
    actions.push({ label: 'Retry', action: 'retry-step', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20' });
    actions.push({ label: 'Skip →', action: 'skip-step', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30 hover:bg-zinc-500/20' });
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {actions.map((a) => (
        <button key={a.action} onClick={() => onAction(step.id, a.action)}
          className={`px-2.5 py-1 rounded text-[11px] font-medium border transition ${a.color}`}>
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Global Story Actions ──

function GlobalActions({ onAction }: { onAction: (action: string) => void }) {
  const [showConfirm, setShowConfirm] = useState<string | null>(null);

  const handleClick = (action: string) => {
    if (action === 'reset-all' || action === 'force-complete') {
      if (showConfirm === action) { onAction(action); setShowConfirm(null); }
      else { setShowConfirm(action); setTimeout(() => setShowConfirm(null), 3000); }
    } else { onAction(action); }
  };

  return (
    <div className="flex gap-1.5 items-center flex-wrap p-2 bg-zinc-800/30 rounded-lg border border-zinc-700/40">
      <span className="text-[10px] text-zinc-500 font-medium mr-1">Story:</span>
      <button onClick={() => handleClick('reset-all')} className="px-2 py-0.5 rounded text-[10px] font-medium text-red-400 bg-red-500/8 border border-red-500/25 hover:bg-red-500/15 transition">
        {showConfirm === 'reset-all' ? '⚠ Confirm Reset?' : '↺ Reset'}
      </button>
      <button onClick={() => handleClick('force-complete')} className="px-2 py-0.5 rounded text-[10px] font-medium text-zinc-400 bg-zinc-500/8 border border-zinc-500/25 hover:bg-zinc-500/15 transition">
        {showConfirm === 'force-complete' ? '⚠ Confirm?' : '⏭ Force Complete'}
      </button>
    </div>
  );
}

// ── Progress Summary Bar ──

function ProgressSummary({ steps }: { steps: LifecycleStep[] }) {
  const total = steps.length;
  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const active = steps.filter(s => s.status === 'active' || s.status === 'waiting_approval').length;
  const pct = Math.round((passed / total) * 100);

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="text-zinc-400">
          {passed}/{total}
          {failed > 0 && <span className="text-red-400 ml-1.5">({failed} failed)</span>}
          {active > 0 && <span className="text-amber-400 ml-1.5">({active} active)</span>}
        </span>
        <span className="text-zinc-500">{pct}%</span>
      </div>
      <div className="h-1 bg-zinc-800 rounded-full overflow-hidden flex">
        {steps.map((step, i) => {
          const c = step.status === 'passed' ? 'bg-emerald-500' : step.status === 'failed' ? 'bg-red-500' :
                    step.status === 'active' ? 'bg-blue-500' : step.status === 'waiting_approval' ? 'bg-amber-500' :
                    step.status === 'skipped' ? 'bg-zinc-600' : 'bg-zinc-800';
          return <div key={i} className={`h-full ${c}`} style={{ width: `${100 / total}%` }} />;
        })}
      </div>
    </div>
  );
}

// ── Event-based status overrides ──

function applyEventOverrides(steps: LifecycleStep[], events: LifecycleEventEntry[]): void {
  const idMap: Record<string, string> = { plan: 'planning', planning: 'planning' };
  const normalize = (id: string) => idMap[id] || id;

  for (const step of steps) {
    const stepEvents = events.filter(e => normalize(e.stepId) === step.id);
    if (stepEvents.length === 0) continue;
    const lastEvent = stepEvents[stepEvents.length - 1];

    switch (lastEvent.event) {
      case 'cancelled':
        if (step.status === 'active' || step.status === 'timeout') {
          step.status = 'failed';
          step.detail = `Cancelled — ${lastEvent.detail || 'by operator'}`;
          const cancelActions: GateAction[] = [];
          if (step.id === 'test') {
            cancelActions.push({ label: 'Auto-fix (AI)', action: 'loop-back-implement', variant: 'loop' });
            cancelActions.push({ label: '← Deliberation', action: 'loop-back-deliberation-from-test', variant: 'loop' });
          }
          if (step.id === 'review') {
            cancelActions.push({ label: '→ Implement', action: 'loop-review-to-implement', variant: 'loop' });
            cancelActions.push({ label: '← Deliberation', action: 'loop-review-to-deliberation', variant: 'loop' });
            cancelActions.push({ label: 'Abandon', action: 'abandon-implementation', variant: 'reject' });
          }
          cancelActions.push({ label: 'Retry Step', action: 'retry-step', variant: 'approve' });
          cancelActions.push({ label: 'Skip →', action: 'skip-step', variant: 'skip' });
          step.gate = { required: false, actions: cancelActions };
        }
        break;
      case 'skipped':
        if (step.status !== 'passed') { step.status = 'skipped'; step.detail = lastEvent.detail || 'Skipped'; }
        break;
      case 'retried':
        if (step.status !== 'passed') { step.status = 'active'; step.detail = 'Retrying...'; step.startedAt = lastEvent.createdAt; }
        break;
      case 'reset':
        if (step.status !== 'passed') { step.status = 'pending'; step.detail = undefined; }
        break;
      case 'failed':
        if (step.status === 'active' || step.status === 'timeout') {
          step.status = 'failed'; step.detail = lastEvent.detail || 'Step failed';
          if (!step.gate) {
            const failActions: GateAction[] = [];
            if (step.id === 'test') {
              failActions.push({ label: 'Auto-fix (AI)', action: 'loop-back-implement', variant: 'loop' });
              failActions.push({ label: '← Deliberation', action: 'loop-back-deliberation-from-test', variant: 'loop' });
            }
            if (step.id === 'review') {
              failActions.push({ label: '→ Implement', action: 'loop-review-to-implement', variant: 'loop' });
              failActions.push({ label: '← Deliberation', action: 'loop-review-to-deliberation', variant: 'loop' });
              failActions.push({ label: 'Abandon', action: 'abandon-implementation', variant: 'reject' });
            }
            failActions.push({ label: 'Retry Step', action: 'retry-step', variant: 'approve' });
            failActions.push({ label: 'Skip →', action: 'skip-step', variant: 'skip' });
            step.gate = { required: false, actions: failActions };
          }
        }
        break;
      case 'started':
        if (step.status !== 'passed') {
          step.status = step.actor === 'human' ? 'waiting_approval' : 'active';
          step.startedAt = lastEvent.createdAt;
          step.detail = undefined;
          step.substeps = undefined; // Clear old substeps on restart (e.g. test retry)
          if (step.actor === 'human' && step.id === 'review') {
            step.gate = { required: true, actions: [
              { label: 'Approve & Merge', action: 'merge-pr', variant: 'approve' },
              { label: 'Request Changes \u2192 Implement', action: 'open-feedback-implement', variant: 'reject' },
              { label: 'Back to Deliberation', action: 'open-feedback-deliberation', variant: 'loop' },
              { label: 'Abandon', action: 'open-feedback-abandon', variant: 'reject' },
            ]};
          }
        }
        break;
      case 'completed':
        if (step.status !== 'passed') { step.status = 'passed'; step.detail = lastEvent.detail || 'Completed'; }
        break;
    }
  }

  let blocked = false;
  for (const step of steps) {
    if (blocked && (step.status === 'active' || step.status === 'waiting_approval')) {
      step.status = 'pending'; step.detail = undefined; step.gate = undefined;
    }
    if (step.status === 'failed') blocked = true;
    if (step.status === 'passed') blocked = false;
  }
}

// ── Build lifecycle steps from story data ──

function getDefaultSteps(): LifecycleStep[] {
  return [
    { id: 'triage', label: 'Triage', description: 'Select a story to see its lifecycle', icon: <Zap className="w-3.5 h-3.5" />, actor: 'human', status: 'pending' },
    { id: 'planning', label: 'Plan', description: '', icon: <FileText className="w-3.5 h-3.5" />, actor: 'human', status: 'pending' },
    { id: 'deliberation', label: 'AI Deliberation', description: '', icon: <Brain className="w-3.5 h-3.5" />, actor: 'ai', status: 'pending' },
    { id: 'implement', label: 'Implement', description: '', icon: <GitPullRequest className="w-3.5 h-3.5" />, actor: 'ai', status: 'pending' },
    { id: 'test', label: 'Test', description: '', icon: <TestTube className="w-3.5 h-3.5" />, actor: 'system', status: 'pending' },
    { id: 'review', label: 'Review & Merge', description: '', icon: <MessageSquare className="w-3.5 h-3.5" />, actor: 'human', status: 'pending' },
    { id: 'deploy', label: 'Deploy', description: '', icon: <Rocket className="w-3.5 h-3.5" />, actor: 'system', status: 'pending' },
    { id: 'release', label: 'Release', description: '', icon: <Mail className="w-3.5 h-3.5" />, actor: 'system', status: 'pending' },
  ];
}

function buildLifecycleSteps(story: StoryLifecycleData | null): LifecycleStep[] {
  if (!story) return getDefaultSteps();

  const s = story;
  const steps: LifecycleStep[] = [];
  const events = s.recentEvents || [];
  const timeouts = s.stepTimeouts || {};
  const loopsDisabled = (s.loopCount || 0) >= (s.maxLoops || 5);

  const getStepStart = (stepId: string): string | null => {
    if (s.lifecycleStep === stepId && s.lifecycleStartedAt) return s.lifecycleStartedAt;
    const started = events.filter(e => e.stepId === stepId && e.event === 'started');
    return started.length > 0 ? started[started.length - 1].createdAt : null;
  };

  // 1. Triage
  const triageStatus: StepStatus = s.triageApproved === true ? 'passed' : s.triageApproved === false ? 'failed' : s.status === 'backlog' ? 'waiting_approval' : 'passed';
  steps.push({
    id: 'triage', label: 'Triage', description: 'Issue or idea reviewed and approved',
    icon: <Zap className="w-3.5 h-3.5" />, actor: 'human', status: triageStatus,
    detail: triageStatus === 'waiting_approval' ? 'Awaiting your approval' : undefined, events,
    gate: triageStatus === 'waiting_approval' ? { required: true, actions: [
      { label: 'Approve', action: 'approve-triage', variant: 'approve' },
      { label: 'Reject', action: 'reject-triage', variant: 'reject' },
      { label: 'Defer', action: 'defer-triage', variant: 'skip' },
    ]} : undefined,
  });

  // 2. Planning
  const planStatus: StepStatus = s.epicId ? 'passed' : triageStatus === 'passed' ? 'active' : 'pending';
  steps.push({
    id: 'planning', label: 'Plan', description: 'Create epic & stories, set priority',
    icon: <FileText className="w-3.5 h-3.5" />, actor: 'human', status: planStatus,
    detail: s.epicId ? `Epic: ${s.epicTitle || s.epicId}` : undefined, events,
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
  if (delibStatus === 'passed') delibSubsteps.forEach(s => s.status = 'passed');

  steps.push({
    id: 'deliberation', label: 'AI Deliberation', description: '4 AI agents propose, debate, vote on architecture',
    icon: <Brain className="w-3.5 h-3.5" />, actor: 'ai', status: delibStatus,
    substeps: delibStatus !== 'pending' && delibStatus !== 'waiting_approval' ? delibSubsteps : undefined,
    detail: delibStatus === 'failed' ? 'Deliberation failed — retry or skip' : undefined,
    timeout: timeouts.deliberation ?? 300, startedAt: delibStatus === 'active' ? getStepStart('deliberation') : null, events,
    gate: delibStatus === 'waiting_approval' ? { required: false, actions: [
      { label: 'Start Deliberation', action: 'start-deliberation', variant: 'approve' },
      { label: 'Skip', action: 'skip-deliberation', variant: 'skip' },
    ]} : delibStatus === 'failed' ? { required: false, actions: [
      { label: 'Restart', action: 'restart-deliberation', variant: 'approve' },
      { label: 'Skip', action: 'skip-deliberation', variant: 'skip' },
    ]} : undefined,
  });

  // 4. Implementation
  const implStatus: StepStatus = s.prNumber ? 'passed' : s.agentLoopStatus === 'running' ? 'active' : s.agentLoopStatus === 'failed' ? 'failed' : (delibStatus === 'passed' && delibPhase === 'decided') ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'implement', label: 'Implement', description: 'AI agent writes code and creates PR',
    agentLoopId: s.agentLoopId || null,
    icon: <GitPullRequest className="w-3.5 h-3.5" />, actor: 'ai', status: implStatus,
    detail: s.prNumber ? `PR #${s.prNumber}` : s.agentLoopStatus === 'running' ? 'Agent coding...' : s.agentLoopStatus === 'failed' ? 'Agent failed — fix & retry' : undefined,
    link: s.prUrl ? { url: s.prUrl, label: `PR #${s.prNumber}` } : undefined,
    timeout: timeouts.implement ?? 600, startedAt: implStatus === 'active' ? getStepStart('implement') : null, events,
    gate: implStatus === 'waiting_approval' ? { required: false, actions: [
      { label: 'Start Agent', action: 'start-agent', variant: 'approve' },
      { label: 'Manual PR', action: 'manual-pr', variant: 'skip' },
    ]} : implStatus === 'failed' ? { required: false, actions: [
      { label: 'Retry Agent', action: 'retry-agent', variant: 'approve' },
      { label: 'Manual Fix', action: 'manual-fix', variant: 'skip' },
    ]} : undefined,
  });

  // 5. Test
  const testStatus: StepStatus = s.testsPass === true ? 'passed' : s.testsPass === false ? 'failed' : s.prNumber ? 'active' : 'pending';
  const testGateActions: GateAction[] = [];
  if (testStatus === 'failed') {
    if (!loopsDisabled) testGateActions.push({ label: 'Auto-fix (AI)', action: 'loop-back-implement', variant: 'loop' });
    if (!loopsDisabled) testGateActions.push({ label: '← Deliberation', action: 'loop-back-deliberation-from-test', variant: 'loop' });
    testGateActions.push({ label: 'Fix Manually', action: 'back-to-implement', variant: 'reject' });
    testGateActions.push({ label: 'Force Continue', action: 'force-continue', variant: 'skip' });
  }
  steps.push({
    id: 'test', label: 'Test', description: 'CI runs: build + unit + UI tests',
    icon: <TestTube className="w-3.5 h-3.5" />, actor: 'system', status: testStatus,
    substeps: s.prNumber ? [
      { label: 'E2E', status: s.e2ePass ?? 'pending' as StepStatus },
      { label: 'Unit', status: s.unitPass ?? 'pending' as StepStatus },
      { label: 'UI', status: s.uiPass ?? 'pending' as StepStatus },
    ] : undefined,
    detail: testStatus === 'failed' ? 'Tests failed — choose recovery action' : undefined,
    timeout: timeouts.test ?? 300, startedAt: testStatus === 'active' ? getStepStart('test') : null, events,
    gate: testGateActions.length > 0 ? { required: false, actions: testGateActions } : undefined,
  });

  // 6. Review & Merge (with loop-back actions)
  const reviewStatus: StepStatus = s.prMerged ? 'passed' : (testStatus === 'passed' && s.prNumber) ? 'waiting_approval' : s.prNumber ? 'pending' : 'pending';
  const reviewGateActions: GateAction[] = [];
  if (reviewStatus === 'waiting_approval') {
    reviewGateActions.push({ label: 'Approve & Merge', action: 'merge-pr', variant: 'approve' });
    if (!loopsDisabled) reviewGateActions.push({ label: 'Request Changes', action: 'open-feedback-implement', variant: 'loop' });
    if (!loopsDisabled) reviewGateActions.push({ label: '← Re-Architect', action: 'open-feedback-deliberation', variant: 'loop' });
    reviewGateActions.push({ label: 'Abandon', action: 'open-feedback-abandon', variant: 'reject' });
  }
  steps.push({
    id: 'review', label: 'Review & Merge', description: 'Review diff, approve and merge after tests pass',
    icon: <MessageSquare className="w-3.5 h-3.5" />, actor: 'human', status: reviewStatus,
    link: s.prUrl ? { url: s.prUrl, label: 'View PR' } : undefined,
    detail: reviewStatus === 'pending' && s.prNumber ? 'Waiting for tests' : undefined, events,
    gate: reviewGateActions.length > 0 ? { required: true, actions: reviewGateActions } : undefined,
  });

  // 7. Deploy
  const deployStatus: StepStatus = s.deployed ? 'passed' : (reviewStatus === 'passed' && s.prMerged) ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'deploy', label: 'Deploy', description: 'Build, sign, notarize, deploy',
    icon: <Rocket className="w-3.5 h-3.5" />, actor: 'system', status: deployStatus,
    detail: s.deployed ? `v${s.version || '?'}` : undefined,
    timeout: timeouts.deploy ?? 600, startedAt: (deployStatus as string) === 'active' ? getStepStart('deploy') : null, events,
    gate: deployStatus === 'waiting_approval' ? { required: true, actions: [
      { label: 'Deploy Release', action: 'deploy-release', variant: 'approve' },
      { label: 'Hold', action: 'hold-deploy', variant: 'skip' },
    ]} : undefined,
  });

  // 8. Release
  const releaseStatus: StepStatus = s.released ? 'passed' : s.deployed ? 'active' : 'pending';
  steps.push({
    id: 'release', label: 'Release', description: 'Release notes, email users, update docs',
    icon: <Mail className="w-3.5 h-3.5" />, actor: 'system', status: releaseStatus,
    substeps: s.deployed ? [
      { label: 'Notes', status: s.releaseNotesDone ? 'passed' : 'pending' as StepStatus },
      { label: 'Email', status: s.emailSent ? 'passed' : 'pending' as StepStatus },
      { label: 'Docs', status: s.docsUpdated ? 'passed' : 'pending' as StepStatus },
    ] : undefined,
    timeout: timeouts.release ?? 120, startedAt: (releaseStatus as string) === 'active' ? getStepStart('release') : null, events,
  });

  applyEventOverrides(steps, events);
  return steps;
}

// ── Loop badge helper ──

function getLoopBadges(events: LifecycleEventEntry[], loopCount: number, maxLoops: number): Record<string, { from: number; to: number }> {
  const badges: Record<string, { from: number; to: number }> = {};
  const loopEvents = events.filter(e => e.event === 'loop-back');

  // Count loops per target step
  const targetCounts: Record<string, number> = {};
  for (const ev of loopEvents) {
    try {
      const d = JSON.parse(ev.detail || '{}');
      const to = d.to || '';
      if (to) targetCounts[to] = (targetCounts[to] || 0) + 1;
    } catch { /* ok */ }
  }

  for (const [stepId, count] of Object.entries(targetCounts)) {
    badges[stepId] = { from: count, to: maxLoops };
    // Also badge the 'from' step
  }

  return badges;
}

// ── Steps with loop arrows between them ──

const LOOP_TARGETS: Record<string, string[]> = {
  test: ['implement', 'deliberation'],
  review: ['implement', 'deliberation'],
};

function hasLoopArrow(fromStepId: string, toStepId: string, events: LifecycleEventEntry[]): boolean {
  return events.some(e => {
    if (e.event !== 'loop-back') return false;
    try {
      const d = JSON.parse(e.detail || '{}');
      return d.from === fromStepId && d.to === toStepId;
    } catch { return false; }
  });
}

// ── Main exported component ──

interface DevLifecycleFlowProps {
  story?: StoryLifecycleData | null;
  stories?: StoryLifecycleData[];
  onGateAction?: (stepId: string, action: string, storyId?: string, reason?: string) => void;
  onSelectStory?: (storyId: string) => void;
}

export default function DevLifecycleFlow({ story, stories, onGateAction, onSelectStory }: DevLifecycleFlowProps) {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(story?.id || null);
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [feedbackDialog, setFeedbackDialog] = useState<{ target: FeedbackTarget; isOpen: boolean }>({ target: 'implement', isOpen: false });
  const [actionError, setActionError] = useState<string | null>(null);

  const activeStory = story || stories?.find(s => s.id === selectedStoryId) || null;
  const allSteps = buildLifecycleSteps(activeStory);
  const templateSteps = activeStory?.lifecycleTemplateSteps;
  const steps = templateSteps ? allSteps.filter(s => templateSteps.includes(s.id)) : allSteps;
  const events = activeStory?.recentEvents || [];
  const loopCount = activeStory?.loopCount || 0;
  const maxLoops = activeStory?.maxLoops || 5;
  const loopBadges = getLoopBadges(events, loopCount, maxLoops);

  // Auto-select the active/waiting step in detail panel
  useEffect(() => {
    if (selectedStepIdx !== null) return; // User already selected
    const activeIdx = steps.findIndex(s =>
      s.status === 'active' || s.status === 'waiting_approval' || s.status === 'timeout' || s.status === 'failed'
    );
    if (activeIdx >= 0) setSelectedStepIdx(activeIdx);
  }, [steps, selectedStepIdx]);

  const handleGateAction = (stepId: string, action: string) => {
    setActionError(null);

    // Intercept feedback dialog actions
    if (action === 'open-feedback-implement') {
      setFeedbackDialog({ target: 'implement', isOpen: true });
      return;
    }
    if (action === 'open-feedback-deliberation') {
      setFeedbackDialog({ target: 'deliberation', isOpen: true });
      return;
    }
    if (action === 'open-feedback-abandon') {
      setFeedbackDialog({ target: 'abandon', isOpen: true });
      return;
    }

    onGateAction?.(stepId, action, activeStory?.id);
  };

  const handleGlobalAction = (action: string) => {
    if (activeStory) onGateAction?.('global', action, activeStory.id);
  };

  const handleSelectStory = (id: string) => {
    setSelectedStoryId(id);
    setSelectedStepIdx(null);
    onSelectStory?.(id);
  };

  const handleFeedbackSubmit = (feedback: string, target: FeedbackTarget) => {
    setFeedbackDialog({ ...feedbackDialog, isOpen: false });
    if (!activeStory) return;

    const actionMap: Record<FeedbackTarget, string> = {
      implement: 'loop-review-to-implement',
      deliberation: 'loop-review-to-deliberation',
      abandon: 'abandon-implementation',
    };

    // Pass feedback as the reason
    onGateAction?.('review', actionMap[target], activeStory.id, feedback);
  };

  const selectedStep = selectedStepIdx !== null ? steps[selectedStepIdx] : null;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Development Lifecycle
          </h3>
          {activeStory && (
            <p className="text-xs text-zinc-500 mt-0.5">
              {activeStory.title}
              {activeStory.scope && activeStory.scope !== 'app' && (
                <span className="ml-1.5 px-1 py-0 rounded text-[9px] bg-cyan-500/15 text-cyan-400 border border-cyan-500/30">
                  {activeStory.scope}
                </span>
              )}
              {activeStory.lifecycleTemplate && activeStory.lifecycleTemplate !== 'full' && (
                <span className="ml-1.5 px-1 py-0 rounded text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                  {activeStory.lifecycleTemplate.replace(/_/g, ' ')}
                </span>
              )}
            </p>
          )}
        </div>
        {/* Legend */}
        <div className="flex gap-2 text-[9px]">
          {(['human', 'ai', 'system'] as Actor[]).map(a => {
            const badge = ACTOR_BADGE[a];
            return (
              <span key={a} className={`inline-flex items-center gap-0.5 px-1 py-0 rounded border ${badge.style}`}>
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
            <button key={s.id} onClick={() => handleSelectStory(s.id)}
              className={`px-2 py-1 rounded text-xs border transition ${
                s.id === selectedStoryId ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}>
              {s.title.length > 35 ? s.title.substring(0, 35) + '...' : s.title}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <ProgressSummary steps={steps} />

      {/* Two-column layout */}
      {activeStory ? (
        <div className="grid grid-cols-1 xl:grid-cols-[55%_45%] gap-4">
          {/* Left column: Steps */}
          <div>
            {/* Global actions */}
            <GlobalActions onAction={handleGlobalAction} />

            {/* Step cards (compact, accordion) with loop arrows */}
            <div className="mt-3 pl-2.5 space-y-0 relative">
              <LoopArrowsSVG arrows={parseLoopArrows(events, maxLoops)} stepCount={steps.length} />
              {steps.map((step, i) => (
                <div key={step.id}>
                  <CompactStepCard
                    step={step}
                    index={i}
                    isSelected={selectedStepIdx === i}
                    onSelect={() => setSelectedStepIdx(selectedStepIdx === i ? null : i)}
                    onGateAction={handleGateAction}
                    loopBadge={loopBadges[step.id] || null}
                  />
                  {i < steps.length - 1 && (
                    <StepConnector fromStatus={step.status} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right column: Detail panel */}
          <div className="space-y-3">
            {selectedStep ? (
              <>
                <DetailPanel
                  step={selectedStep}
                  allEvents={events}
                  onGateAction={handleGateAction}
                  story={activeStory}
                />
                {/* Loop history (below detail) */}
                {loopCount > 0 && (
                  <LoopHistoryPanel events={events} loopCount={loopCount} maxLoops={maxLoops} />
                )}
              </>
            ) : (
              <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-6 text-center">
                <Shield className="w-6 h-6 mx-auto mb-2 text-zinc-700" />
                <p className="text-xs text-zinc-600">Click a step to see details</p>
              </div>
            )}

            {/* Action error banner */}
            {actionError && (
              <div className="px-3 py-2 rounded-md bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2">
                <XCircle className="w-3.5 h-3.5 shrink-0" /> {actionError}
                <button onClick={() => setActionError(null)} className="ml-auto text-red-500 hover:text-red-400">✕</button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Empty state */
        <div className="text-center py-8 text-zinc-600 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Select a story from Planning to track its lifecycle
        </div>
      )}

      {/* Feedback Dialog */}
      <FeedbackDialog
        isOpen={feedbackDialog.isOpen}
        target={feedbackDialog.target}
        storyTitle={activeStory?.title || ''}
        onSubmit={handleFeedbackSubmit}
        onCancel={() => setFeedbackDialog({ ...feedbackDialog, isOpen: false })}
      />
    </div>
  );
}
