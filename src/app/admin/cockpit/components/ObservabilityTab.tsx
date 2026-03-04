'use client';

import { useState, useMemo } from 'react';
import {
  Loader2, RotateCcw, ExternalLink, AlertTriangle,
  CheckCircle2, XCircle, Clock, Zap, Monitor, Bot, Cpu,
} from 'lucide-react';

// ─── types (mirror API) ────────────────────────────────────────────────────────

interface ObsPhase {
  id: string;
  lane: 'pi' | 'ai-dev-mac' | 'ci-mac';
  stepId: string;
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: 'running' | 'success' | 'failed' | 'queued' | 'stuck' | 'skipped';
  githubRunId?: number;
  githubUrl?: string;
  airflowRunId?: string;
  agentLoopId?: string;
}

interface ObsStory {
  id: string;
  title: string;
  status: string;
  colorIndex: number;
  phases: ObsPhase[];
}

interface UnlinkedRun {
  id: string;
  lane: 'ai-dev-mac' | 'ci-mac';
  label: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: string;
  isStuck: boolean;
  url?: string;
}

interface ObsData {
  window: number;
  windowStart: string;
  nowMs: number;
  stories: ObsStory[];
  unlinked: UnlinkedRun[];
  configured: { github: boolean; airflow: boolean };
}

interface ObservabilityTabProps {
  data: ObsData | null;
  loading: boolean;
  onRefetch: () => void;
  onWindowChange: (hours: number) => void;
  windowHours: number;
}

// ─── constants ────────────────────────────────────────────────────────────────

const PHASE_COLORS: Record<string, string> = {
  triage:                'bg-zinc-500/55',
  plan:                  'bg-zinc-400/55',
  deliberation:          'bg-indigo-500/70',
  implement:             'bg-amber-500/70',
  test:                  'bg-blue-500/65',
  review:                'bg-orange-500/65',
  deploy:                'bg-emerald-500/70',
  release:               'bg-purple-500/70',
  'pr-check':            'bg-blue-400/65',
  'e2e':                 'bg-cyan-500/70',
  'story_implementation':'bg-amber-400/65',
  'release_pipeline':    'bg-emerald-400/65',
  'nightly_build':       'bg-zinc-500/50',
  'nightly':             'bg-zinc-500/50',
  'architecture_review': 'bg-indigo-400/55',
  'health_check':        'bg-zinc-400/40',
  'Agent Loop':          'bg-amber-400/65',
  stuck:                 'bg-orange-500/85',
};

function phaseColor(phase: ObsPhase) {
  if (phase.status === 'stuck') return PHASE_COLORS.stuck;
  return PHASE_COLORS[phase.stepId] || PHASE_COLORS[phase.label] || 'bg-zinc-600/55';
}

// Story connector palette (8 distinct hues)
const S_PALETTE = [
  { bg: 'bg-blue-500/30', border: 'border-blue-400/60', text: 'text-blue-400' },
  { bg: 'bg-amber-500/30', border: 'border-amber-400/60', text: 'text-amber-400' },
  { bg: 'bg-teal-500/30', border: 'border-teal-400/60', text: 'text-teal-400' },
  { bg: 'bg-rose-500/30', border: 'border-rose-400/60', text: 'text-rose-400' },
  { bg: 'bg-lime-500/30', border: 'border-lime-400/60', text: 'text-lime-400' },
  { bg: 'bg-violet-500/30', border: 'border-violet-400/60', text: 'text-violet-400' },
  { bg: 'bg-orange-500/30', border: 'border-orange-400/60', text: 'text-orange-400' },
  { bg: 'bg-sky-500/30', border: 'border-sky-400/60', text: 'text-sky-400' },
];

const LANE_META = {
  pi:          { label: 'Pi', Icon: Cpu,     color: 'text-indigo-400', border: 'border-indigo-500/30', bg: 'bg-indigo-500/8' },
  'ai-dev-mac':{ label: 'AI Dev Mac', Icon: Bot,     color: 'text-purple-400', border: 'border-purple-500/30', bg: 'bg-purple-500/8' },
  'ci-mac':    { label: 'CI Mac', Icon: Monitor, color: 'text-teal-400', border: 'border-teal-500/30', bg: 'bg-teal-500/8' },
} as const;

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatDur(ms: number | null): string {
  if (!ms || ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function barStyle(startedAt: string, endedAt: string | null, windowStart: number, windowMs: number, nowMs: number) {
  const s = Math.max(new Date(startedAt).getTime(), windowStart);
  const e = endedAt ? new Date(endedAt).getTime() : nowMs;
  const clamped = Math.min(e, windowStart + windowMs);
  const left = ((s - windowStart) / windowMs) * 100;
  const width = Math.max(((clamped - s) / windowMs) * 100, 0.35);
  return { left: `${left}%`, width: `${width}%` };
}

/** Greedy row-packing so overlapping bars don't draw on top of each other */
function packRows(items: { id: string; leftPct: number; widthPct: number }[]): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.leftPct - b.leftPct);
  const rowEnds: number[] = [];
  const result = new Map<string, number>();
  for (const item of sorted) {
    let placed = false;
    for (let r = 0; r < rowEnds.length; r++) {
      if (rowEnds[r] + 0.3 <= item.leftPct) {
        rowEnds[r] = item.leftPct + item.widthPct;
        result.set(item.id, r);
        placed = true;
        break;
      }
    }
    if (!placed) {
      result.set(item.id, rowEnds.length);
      rowEnds.push(item.leftPct + item.widthPct);
    }
  }
  return result;
}

const BAR_H = 22; // px per bar row
const BAR_GAP = 4; // px gap between rows
const LANE_PAD = 6; // px top/bottom padding in lane

// ─── sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  if (status === 'stuck') return <AlertTriangle className="w-3 h-3 text-orange-400 flex-shrink-0" />;
  if (status === 'running') return <Loader2 className="w-3 h-3 text-amber-400 animate-spin flex-shrink-0" />;
  if (status === 'success') return <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />;
  if (status === 'failed') return <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />;
  if (status === 'skipped') return <Zap className="w-3 h-3 text-zinc-500 flex-shrink-0" />;
  return <Clock className="w-3 h-3 text-blue-400 flex-shrink-0" />;
}

function LaneBadge({ lane }: { lane: 'pi' | 'ai-dev-mac' | 'ci-mac' }) {
  const m = LANE_META[lane];
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border ${m.color} ${m.border} font-medium`}>
      <m.Icon className="w-2.5 h-2.5" /> {m.label}
    </span>
  );
}

// ─── lane row ────────────────────────────────────────────────────────────────

interface LaneRowProps {
  lane: 'pi' | 'ai-dev-mac' | 'ci-mac';
  phases: ObsPhase[];
  windowStart: number;
  windowMs: number;
  nowMs: number;
  storyColors: Map<string, number>; // phaseId → colorIndex
  axisLines: { pct: number }[];
}

function LaneRow({ lane, phases, windowStart, windowMs, nowMs, storyColors, axisLines }: LaneRowProps) {
  const meta = LANE_META[lane];
  const [tooltip, setTooltip] = useState<ObsPhase | null>(null);

  const items = phases.map(p => {
    const s = barStyle(p.startedAt, p.endedAt, windowStart, windowMs, nowMs);
    return { id: p.id, leftPct: parseFloat(s.left), widthPct: parseFloat(s.width), phase: p, style: s };
  });
  const rows = packRows(items.map(i => ({ id: i.id, leftPct: i.leftPct, widthPct: i.widthPct })));
  const maxRow = items.length > 0 ? Math.max(...items.map(i => rows.get(i.id) ?? 0)) : 0;
  const laneH = LANE_PAD * 2 + (maxRow + 1) * BAR_H + maxRow * BAR_GAP;

  return (
    <div className={`flex border-b border-zinc-800 ${meta.bg}`}>
      {/* Lane header */}
      <div className={`w-28 flex-shrink-0 flex flex-col justify-center px-3 py-2 border-r ${meta.border}`}>
        <div className={`flex items-center gap-1.5 text-xs font-semibold ${meta.color}`}>
          <meta.Icon className="w-3.5 h-3.5" /> {meta.label}
        </div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{phases.length} runs</div>
      </div>

      {/* Bar area */}
      <div className="flex-1 relative" style={{ height: `${laneH}px` }}>
        {/* Grid lines */}
        {axisLines.map(a => (
          <div key={a.pct} className="absolute top-0 bottom-0 w-px bg-zinc-800/60" style={{ left: `${a.pct}%` }} />
        ))}

        {/* "Now" indicator */}
        <div className="absolute top-0 bottom-0 w-px bg-zinc-500/40 z-10" style={{ left: '100%' }} />

        {/* Phase bars */}
        {items.map(item => {
          const row = rows.get(item.id) ?? 0;
          const top = LANE_PAD + row * (BAR_H + BAR_GAP);
          const ci = storyColors.get(item.id);
          const sp = ci !== undefined ? S_PALETTE[ci] : null;
          const color = phaseColor(item.phase);
          const isRunning = item.phase.status === 'running';
          const isStuck = item.phase.status === 'stuck';

          return (
            <div
              key={item.id}
              className={`absolute rounded-sm cursor-pointer ${color} ${isStuck ? 'animate-pulse' : ''} hover:brightness-125 transition-all border border-white/10 z-20`}
              style={{ left: item.style.left, width: item.style.width, top: `${top}px`, height: `${BAR_H}px` }}
              onMouseEnter={() => setTooltip(item.phase)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Story color accent on left edge */}
              {sp && <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-sm ${sp.bg} border-l ${sp.border}`} />}
              {/* Bar label (if wide enough) */}
              {item.widthPct > 6 && (
                <span className="absolute inset-0 flex items-center pl-2 text-[10px] font-medium text-white/80 truncate pointer-events-none">
                  {item.phase.label}
                </span>
              )}
              {isRunning && (
                <span className="absolute right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/60 rounded-full animate-pulse" />
              )}
            </div>
          );
        })}

        {/* Tooltip */}
        {tooltip && (
          <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl p-2.5 text-xs min-w-[200px] pointer-events-none">
            <div className="font-semibold text-zinc-200 mb-1">{tooltip.label}</div>
            <div className="space-y-0.5 text-zinc-400">
              <div>Status: <span className="text-zinc-200">{tooltip.status}</span></div>
              <div>Start: <span className="text-zinc-200">{fmtDateTime(tooltip.startedAt)}</span></div>
              {tooltip.endedAt && <div>End: <span className="text-zinc-200">{fmtDateTime(tooltip.endedAt)}</span></div>}
              <div>Duration: <span className="text-zinc-200">{formatDur(tooltip.durationMs)}</span></div>
              {tooltip.githubUrl && <div><a href={tooltip.githubUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">View on GitHub</a></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function ObservabilityTab({ data, loading, onRefetch, onWindowChange, windowHours }: ObservabilityTabProps) {
  const nowMs = data?.nowMs ?? Date.now();
  const windowMs = windowHours * 60 * 60 * 1000;
  const windowStart = nowMs - windowMs;

  // Build storyId → colorIndex mapping for phase bar accents
  const storyColorMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data?.stories ?? []) {
      for (const p of s.phases) m.set(p.id, s.colorIndex);
    }
    return m;
  }, [data]);

  // Time axis — one label every 4h (or 1h for 6h window, 1d for 7d)
  const axisInterval = windowHours <= 6 ? 1 : windowHours <= 24 ? 4 : 24;
  const axisLabels: { label: string; pct: number }[] = [];
  for (let h = 0; h <= windowHours; h += axisInterval) {
    const ts = windowStart + h * 60 * 60 * 1000;
    const d = new Date(ts);
    const label = d.getHours() === 0 && d.getMinutes() === 0
      ? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    axisLabels.push({ label, pct: (h / windowHours) * 100 });
  }
  const axisLines = axisLabels.slice(1, -1).map(a => ({ pct: a.pct }));

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const stories = data?.stories ?? [];
  const unlinked = data?.unlinked ?? [];
  const allPhases = stories.flatMap(s => s.phases);

  const activeCount = allPhases.filter(p => p.status === 'running').length;
  const stuckCount = allPhases.filter(p => p.status === 'stuck').length + unlinked.filter(u => u.isStuck).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{stories.length} stories · {allPhases.length} phases</span>
          {activeCount > 0 && <span className="text-amber-400">{activeCount} running</span>}
          {stuckCount > 0 && <span className="text-orange-400">{stuckCount} stuck</span>}
          {!data?.configured.github && <span className="text-zinc-600">· GitHub unconfigured</span>}
          {!data?.configured.airflow && <span className="text-zinc-600">· Airflow unconfigured</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* Window selector */}
          <div className="flex items-center gap-0.5 bg-zinc-800 border border-zinc-700 rounded-lg p-0.5">
            {([6, 24, 168] as const).map(h => (
              <button key={h} onClick={() => onWindowChange(h)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition ${windowHours === h ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
                {h === 6 ? '6h' : h === 24 ? '24h' : '7d'}
              </button>
            ))}
          </div>
          <button onClick={onRefetch} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition" title="Refresh">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {stories.length === 0 && unlinked.length === 0 ? (
          <div className="p-12 text-center text-sm text-zinc-500">
            No pipeline activity in the last {windowHours === 168 ? '7 days' : `${windowHours} hours`}
          </div>
        ) : (
          <>
            {/* Three lanes */}
            {(['pi', 'ai-dev-mac', 'ci-mac'] as const).map(lane => {
              const phases = allPhases.filter(p => p.lane === lane);
              const unlinkedForLane = unlinked.filter(u => u.lane === lane);

              // Synthesize phases from unlinked runs for display
              const unlinkedPhases: ObsPhase[] = unlinkedForLane.map(u => ({
                id: `ul-${u.id}`,
                lane: lane as 'ci-mac' | 'ai-dev-mac',
                stepId: u.label.toLowerCase().replace(/\s+/g, '_'),
                label: u.label,
                startedAt: u.startedAt,
                endedAt: u.endedAt,
                durationMs: u.durationMs,
                status: u.isStuck ? 'stuck' : (u.status === 'success' || u.status === 'completed') ? 'success' : (u.status === 'failed') ? 'failed' : (u.status === 'running') ? 'running' : 'queued',
                githubUrl: u.url,
              }));

              return (
                <LaneRow
                  key={lane}
                  lane={lane}
                  phases={[...phases, ...unlinkedPhases]}
                  windowStart={windowStart}
                  windowMs={windowMs}
                  nowMs={nowMs}
                  storyColors={storyColorMap}
                  axisLines={axisLines}
                />
              );
            })}

            {/* Story span connectors */}
            {stories.length > 0 && (
              <div className="border-b border-zinc-800 relative" style={{ paddingLeft: '7rem' }}>
                <div className="relative" style={{ height: `${stories.length * 18 + 8}px` }}>
                  {/* Grid lines */}
                  {axisLines.map(a => (
                    <div key={a.pct} className="absolute top-0 bottom-0 w-px bg-zinc-800/60" style={{ left: `${a.pct}%` }} />
                  ))}
                  {stories.map((story, idx) => {
                    const sp = S_PALETTE[story.colorIndex];
                    const allStarts = story.phases.map(p => new Date(p.startedAt).getTime());
                    const allEnds = story.phases.map(p => p.endedAt ? new Date(p.endedAt).getTime() : nowMs);
                    const firstMs = Math.max(Math.min(...allStarts), windowStart);
                    const lastMs = Math.min(Math.max(...allEnds), nowMs);
                    const left = ((firstMs - windowStart) / windowMs) * 100;
                    const width = Math.max(((lastMs - firstMs) / windowMs) * 100, 0.5);
                    const lanesUsed = Array.from(new Set(story.phases.map(p => p.lane)));
                    const isMultiLane = lanesUsed.length > 1;

                    return (
                      <div key={story.id} className="absolute" style={{ top: `${4 + idx * 18}px`, left: `${left}%`, width: `${width}%`, height: '12px' }}>
                        <div className={`h-full rounded-sm ${sp.bg} border ${sp.border} flex items-center overflow-hidden`}>
                          <span className={`text-[9px] font-medium ${sp.text} truncate px-1.5`}>{story.title}</span>
                        </div>
                        {isMultiLane && (
                          <div className={`absolute -right-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full border ${sp.border} ${sp.bg}`} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="absolute left-0 top-0 bottom-0 w-28 flex items-center px-3">
                  <span className="text-[10px] text-zinc-600">Stories</span>
                </div>
              </div>
            )}

            {/* Time axis */}
            <div className="flex border-b border-zinc-800">
              <div className="w-28 flex-shrink-0 border-r border-zinc-800 bg-zinc-900/50" />
              <div className="flex-1 relative h-7">
                {axisLabels.map(a => (
                  <span
                    key={a.pct}
                    className="absolute text-[9px] text-zinc-600 -translate-x-1/2 top-1/2 -translate-y-1/2"
                    style={{ left: `${a.pct}%` }}
                  >
                    {a.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap px-4 py-2.5 bg-zinc-900/60">
              {[
                { key: 'deliberation', label: 'Deliberation' },
                { key: 'implement', label: 'Implement / Agent' },
                { key: 'test', label: 'Test / PR Check' },
                { key: 'e2e', label: 'E2E' },
                { key: 'review', label: 'Review' },
                { key: 'deploy', label: 'Deploy' },
                { key: 'release', label: 'Release' },
                { key: 'stuck', label: 'Stuck' },
              ].map(l => (
                <div key={l.key} className="flex items-center gap-1 text-[10px] text-zinc-500">
                  <div className={`w-3 h-2 rounded-sm ${PHASE_COLORS[l.key] || 'bg-zinc-600/55'}`} /> {l.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Unified log */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-800 text-xs font-semibold text-zinc-400">
          Unified Run Log
        </div>
        {allPhases.length === 0 && unlinked.length === 0 ? (
          <p className="text-xs text-zinc-600 p-4 text-center">No runs recorded in the selected window</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Time</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Lane</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Story / Name</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Phase</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Status</th>
                  <th className="text-left px-3 py-2 text-zinc-500 font-medium">Duration</th>
                  <th className="text-right px-3 py-2 text-zinc-500 font-medium">Link</th>
                </tr>
              </thead>
              <tbody>
                {/* Linked story phases */}
                {stories.flatMap(story => {
                  const sp = S_PALETTE[story.colorIndex];
                  return story.phases
                    .slice()
                    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
                    .map(phase => (
                      <tr key={phase.id} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 ${phase.status === 'stuck' ? 'bg-orange-500/5' : ''}`}>
                        <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{fmtTime(phase.startedAt)}</td>
                        <td className="px-3 py-2"><LaneBadge lane={phase.lane} /></td>
                        <td className="px-3 py-2">
                          <span className={`text-[10px] font-medium ${sp.text} truncate block max-w-[180px]`}>{story.title}</span>
                        </td>
                        <td className="px-3 py-2 text-zinc-300">{phase.label}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <StatusIcon status={phase.status} />
                            <span className="text-zinc-400">{phase.status}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-zinc-500 font-mono">{formatDur(phase.durationMs)}</td>
                        <td className="px-3 py-2 text-right">
                          {phase.githubUrl && (
                            <a href={phase.githubUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    ));
                })}
                {/* Unlinked runs */}
                {unlinked.map(u => (
                  <tr key={u.id} className={`border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 opacity-60 ${u.isStuck ? 'bg-orange-500/5 opacity-100' : ''}`}>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{fmtTime(u.startedAt)}</td>
                    <td className="px-3 py-2"><LaneBadge lane={u.lane} /></td>
                    <td className="px-3 py-2 text-zinc-600 italic text-[10px]">unlinked</td>
                    <td className="px-3 py-2 text-zinc-400">{u.label}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <StatusIcon status={u.isStuck ? 'stuck' : u.status} />
                        <span className="text-zinc-400">{u.isStuck ? 'stuck' : u.status}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-zinc-500 font-mono">{formatDur(u.durationMs)}</td>
                    <td className="px-3 py-2 text-right">
                      {u.url && (
                        <a href={u.url} target="_blank" rel="noopener noreferrer" className="text-zinc-600 hover:text-zinc-300">
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
