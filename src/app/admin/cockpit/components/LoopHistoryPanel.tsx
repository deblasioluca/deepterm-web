'use client';

import { useState } from 'react';
import { RefreshCcw, ChevronDown, ChevronRight, AlertTriangle, ArrowRight } from 'lucide-react';

interface LoopEvent {
  id: string;
  stepId: string;
  event: string;
  detail?: string | null;
  actor: string;
  createdAt: string;
}

interface LoopHistoryPanelProps {
  events: LoopEvent[];
  loopCount: number;
  maxLoops: number;
}

interface ParsedLoop {
  from: string;
  to: string;
  reason?: string;
  feedback?: string;
  timestamp: string;
  index: number;
}

const STEP_LABELS: Record<string, string> = {
  triage: 'Triage',
  plan: 'Plan',
  planning: 'Plan',
  deliberation: 'Deliberation',
  implement: 'Implement',
  test: 'Test',
  review: 'Review',
  deploy: 'Deploy',
  release: 'Release',
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

export default function LoopHistoryPanel({ events, loopCount, maxLoops }: LoopHistoryPanelProps) {
  const [expanded, setExpanded] = useState(true);

  // Extract loop-back events
  const loopEvents = events.filter(e => e.event === 'loop-back');
  const parsed: ParsedLoop[] = loopEvents.map((ev, i) => {
    let from = '', to = '', reason = '', feedback = '';
    try {
      const d = JSON.parse(ev.detail || '{}');
      from = d.from || ev.stepId || '';
      to = d.to || '';
      reason = d.reason || '';
      feedback = d.feedback || '';
    } catch {
      from = ev.stepId || '';
    }
    return { from, to, reason, feedback, timestamp: ev.createdAt, index: loopEvents.length - i };
  }).reverse(); // newest first

  if (parsed.length === 0 && loopCount === 0) return null;

  const atLimit = loopCount >= maxLoops;

  return (
    <div className="bg-zinc-900/60 border border-zinc-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/40 transition text-left"
      >
        <RefreshCcw className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-xs font-medium text-zinc-200 flex-1">
          Loop History
        </span>
        <span className="text-[10px] text-zinc-500">
          {loopCount}/{maxLoops}
        </span>
        {atLimit && (
          <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded">
            Limit reached
          </span>
        )}
        {expanded ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {atLimit && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-red-500/8 border border-red-500/20 text-[11px] text-red-400">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>Circuit breaker triggered — max {maxLoops} loops reached. Loops disabled, manual intervention required.</span>
            </div>
          )}

          {parsed.length === 0 ? (
            <p className="text-[11px] text-zinc-600 py-1">
              {loopCount > 0 ? `${loopCount} loop(s) recorded, but no details available.` : 'No loops yet.'}
            </p>
          ) : (
            parsed.map((loop) => (
              <div
                key={`${loop.timestamp}-${loop.index}`}
                className="border-l-2 border-amber-500/30 pl-3 py-1.5"
              >
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="text-amber-400 font-medium">#{loop.index}</span>
                  <span className="text-zinc-400">
                    {STEP_LABELS[loop.from] || loop.from}
                  </span>
                  <ArrowRight className="w-3 h-3 text-zinc-600" />
                  <span className="text-zinc-400">
                    {STEP_LABELS[loop.to] || loop.to}
                  </span>
                  <span className="text-zinc-600 ml-auto text-[10px]">
                    {formatTime(loop.timestamp)}
                  </span>
                </div>
                {loop.reason && (
                  <p className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">
                    {loop.reason}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
