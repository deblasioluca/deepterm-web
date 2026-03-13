'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, XCircle, Loader2, Clock, Hammer, FlaskConical, Monitor, Globe } from 'lucide-react';

interface SuiteState {
  status: 'pending' | 'active' | 'passed' | 'failed';
  passed: number;
  total: number;
  duration?: number;
  failures?: { test: string; message: string; file?: string; line?: number }[];
  startedAt?: string;
}

interface TestState {
  build: SuiteState; unit: SuiteState; ui: SuiteState; e2e: SuiteState;
  overall: 'pending' | 'active' | 'passed' | 'failed';
  ciDispatched: boolean | null; lastUpdated: string | null;
}

const SUITE_TIMEOUTS = { build: 300, unit: 300, ui: 600, e2e: 300 };

const empty = (): SuiteState => ({ status: 'pending', passed: 0, total: 0 });
const DEFAULT_STATE: TestState = {
  build: empty(), unit: empty(), ui: empty(), e2e: empty(),
  overall: 'pending', ciDispatched: null, lastUpdated: null,
};

function getElapsed(s?: string | null) {
  return s ? Math.floor((Date.now() - new Date(s).getTime()) / 1000) : 0;
}
function fmt(s: number) { return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`; }

function SuiteRow({ label, icon, suite, timeout, startedAt }: {
  label: string; icon: React.ReactNode; suite: SuiteState; timeout: number; startedAt?: string | null;
}) {
  const [elapsed, setElapsed] = useState(() => getElapsed(suite.startedAt || startedAt));
  useEffect(() => {
    if (suite.status !== 'active') return;
    const iv = setInterval(() => setElapsed(getElapsed(suite.startedAt || startedAt)), 1000);
    return () => clearInterval(iv);
  }, [suite.status, suite.startedAt, startedAt]);

  const timedOut = suite.status === 'active' && elapsed >= timeout;
  const pct = Math.min((elapsed / timeout) * 100, 100);

  const statusIcon =
    suite.status === 'passed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
    : suite.status === 'failed' ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
    : suite.status === 'active'
      ? <Loader2 className={`w-3.5 h-3.5 shrink-0 ${timedOut ? 'text-amber-400' : 'text-blue-400 animate-spin'}`} />
    : <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" />;

  const countText = suite.total > 0 ? `${suite.passed}/${suite.total}` : suite.status === 'active' ? 'running…' : '';
  const clr = suite.status === 'passed' ? 'text-emerald-400'
    : suite.status === 'failed' ? 'text-red-400'
    : suite.status === 'active' ? (timedOut ? 'text-amber-400' : 'text-blue-400') : 'text-zinc-600';

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {statusIcon}
        <span className="flex items-center gap-1 text-[11px] text-zinc-400">{icon} {label}</span>
        <span className={`text-[11px] font-mono ml-auto ${clr}`}>{countText}</span>
        {suite.duration != null && <span className="text-[10px] text-zinc-600">{fmt(suite.duration)}</span>}
        {suite.status === 'active' && (
          <span className={`text-[10px] font-mono ${timedOut ? 'text-amber-400' : 'text-zinc-500'}`}>{fmt(elapsed)}</span>
        )}
      </div>
      {suite.status === 'active' && (
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${timedOut ? 'bg-amber-500' : pct > 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
      {timedOut && <p className="text-[10px] text-amber-400">⚠ Exceeded {fmt(timeout)} limit — may be stuck</p>}
      {suite.status === 'failed' && suite.failures && suite.failures.length > 0 && (
        <div className="mt-1 space-y-1 pl-5">
          {suite.failures.slice(0, 3).map((f, i) => (
            <div key={i} className="text-[10px] text-red-400/80 font-mono">
              ✗ {f.test}
              {f.file && <span className="text-zinc-600"> ({f.file}{f.line ? `:${f.line}` : ''})</span>}
            </div>
          ))}
          {suite.failures.length > 3 && <p className="text-[10px] text-zinc-600">+{suite.failures.length - 3} more</p>}
        </div>
      )}
    </div>
  );
}

export default function TestProgressPanel({
  storyId, scope = 'app', startedAt, onLoopBack,
}: {
  storyId: string; scope?: 'app' | 'web' | 'both'; startedAt?: string | null; onLoopBack?: (action: string, reason?: string) => void;
}) {
  const [state, setState] = useState<TestState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cockpit/lifecycle/events?storyId=${storyId}&stepId=test&limit=50`);
      if (!res.ok) return;
      const data = await res.json();
      const events: { event: string; detail: string | null; createdAt: string }[] = data.events || [];
      const next = structuredClone(DEFAULT_STATE);
      const sorted = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const ev of sorted) {
        let d: Record<string, unknown> = {};
        try { d = ev.detail ? JSON.parse(ev.detail) : {}; } catch { continue; }
        if (d.ciDispatched !== undefined) next.ciDispatched = !!d.ciDispatched;
        const suite = d.suite as string | undefined;
        if (suite && ['build', 'unit', 'ui', 'e2e'].includes(suite)) {
          const s = next[suite as keyof Pick<TestState, 'build' | 'unit' | 'ui' | 'e2e'>];
          if (ev.event === 'started') { s.status = 'active'; s.startedAt = ev.createdAt; }
          else if (['progress', 'completed', 'failed'].includes(ev.event)) {
            s.status = ev.event === 'completed' ? 'passed' : ev.event === 'failed' ? 'failed' : 'active';
            if (typeof d.passed === 'number') s.passed = d.passed;
            if (typeof d.total === 'number') s.total = d.total;
            if (typeof d.duration === 'number') s.duration = d.duration;
            if (Array.isArray(d.failures)) s.failures = d.failures as typeof s.failures;
          }
        }
        if (!suite) {
          if (ev.event === 'completed') {
            next.overall = 'passed';
            (['build', 'unit', 'ui'] as const).forEach(k => { if (next[k].status === 'pending') next[k].status = 'passed'; });
          } else if (ev.event === 'failed') next.overall = 'failed';
          else if (ev.event === 'started') next.overall = 'active';
        }
        next.lastUpdated = ev.createdAt;
      }
      if (next.overall === 'pending' && next.ciDispatched) next.overall = 'active';
      if ((['build', 'unit', 'ui', 'e2e'] as const).some(k => next[k].status === 'active')) next.overall = 'active';
      setState(next);
    } finally { setLoading(false); }
  }, [storyId]);

  useEffect(() => {
    fetchEvents();
    const iv = setInterval(fetchEvents, 8000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  if (loading) return (
    <div className="flex items-center gap-2 text-[11px] text-zinc-500 py-1">
      <Loader2 className="w-3 h-3 animate-spin" /> Loading…
    </div>
  );

  type SuiteKey = keyof Pick<TestState, 'build' | 'unit' | 'ui' | 'e2e'>;
  const rows: { key: SuiteKey; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'build', label: 'Build',            icon: <Hammer className="w-2.5 h-2.5" />,       show: scope !== 'web' },
    { key: 'unit',  label: 'Unit Tests',       icon: <FlaskConical className="w-2.5 h-2.5" />, show: scope !== 'web' },
    { key: 'ui',    label: 'UI Tests',         icon: <Monitor className="w-2.5 h-2.5" />,      show: scope !== 'web' },
    { key: 'e2e',   label: 'E2E (Playwright)', icon: <Globe className="w-2.5 h-2.5" />,        show: scope === 'web' || scope === 'both' },
  ];

  if (!state.ciDispatched && state.overall === 'pending')
    return <p className="text-[11px] text-zinc-500 py-1">Waiting for CI dispatch…</p>;

  return (
    <div className="space-y-3">
      {rows.filter(r => r.show).map(r => (
        <SuiteRow key={r.key} label={r.label} icon={r.icon} suite={state[r.key]} timeout={SUITE_TIMEOUTS[r.key]} startedAt={startedAt} />
      ))}
      {state.overall === 'passed' && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> All suites passed
        </div>
      )}
      {state.overall === 'failed' && (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-red-500/10 border border-red-500/20 text-[11px] text-red-400">
          <XCircle className="w-3.5 h-3.5" /> Tests failed
        </div>
      )}
    </div>
  );
}
