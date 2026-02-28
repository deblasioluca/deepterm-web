"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Circle, Loader2, Clock, AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";

// ── Types ──

interface TestFailure {
  test: string;
  class?: string;
  message: string;
  file?: string;
  line?: number;
}

interface TestSuiteData {
  suite: string;
  label: string;
  status: "pending" | "active" | "passed" | "failed" | "skipped";
  passed?: number;
  failed?: number;
  total?: number;
  duration?: number;
  failures?: TestFailure[];
  timeoutSeconds: number;
  elapsed?: number;
  currentTest?: string;
}

interface LifecycleEvent {
  id: string;
  storyId: string;
  stepId: string;
  event: string;
  detail: string | null;
  actor: string | null;
  createdAt: string;
}

interface TestProgressPanelProps {
  storyId: string;
  scope?: "app" | "web" | "both";
  startedAt?: string | null;
  onLoopBack?: (action: string, reason?: string) => void;
}

// ── Constants ──

const SUITE_CONFIG: Record<string, { label: string; timeout: number; order: number }> = {
  build: { label: "Build Verification", timeout: 300, order: 0 },
  unit: { label: "Unit Tests (XCTest)", timeout: 300, order: 1 },
  ui: { label: "UI Tests (XCUITest)", timeout: 600, order: 2 },
  e2e: { label: "E2E (Playwright)", timeout: 300, order: 3 },
};

const STATUS_COLORS = {
  pending: { bg: "bg-zinc-800/50", border: "border-zinc-700", text: "text-zinc-500", icon: Circle },
  active: { bg: "bg-blue-500/5", border: "border-blue-500/30", text: "text-blue-400", icon: Loader2 },
  passed: { bg: "bg-emerald-500/5", border: "border-emerald-500/30", text: "text-emerald-400", icon: CheckCircle2 },
  failed: { bg: "bg-red-500/5", border: "border-red-500/30", text: "text-red-400", icon: XCircle },
  skipped: { bg: "bg-zinc-800/30", border: "border-zinc-700/50", text: "text-zinc-600", icon: Circle },
};

// ── Helpers ──

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function parseSuitesFromEvents(events: LifecycleEvent[], scope: string): TestSuiteData[] {
  // Determine which suites to show based on scope
  const suiteKeys = scope === "web" ? ["e2e"] : scope === "both" ? ["build", "unit", "ui", "e2e"] : ["build", "unit", "ui"];

  const suites: Record<string, TestSuiteData> = {};
  for (const key of suiteKeys) {
    const cfg = SUITE_CONFIG[key];
    suites[key] = {
      suite: key,
      label: cfg.label,
      status: "pending",
      timeoutSeconds: cfg.timeout,
    };
  }

  // Process events to populate suite data
  for (const ev of events) {
    if (ev.stepId !== "test") continue;
    let detail: Record<string, unknown> = {};
    try {
      detail = ev.detail ? JSON.parse(ev.detail) : {};
    } catch {
      continue;
    }

    const suite = (detail.suite as string) || "";
    if (!suite || !suites[suite]) continue;

    if (ev.event === "started") {
      suites[suite].status = "active";
    } else if (ev.event === "progress") {
      suites[suite].status = "active";
      if (detail.passed !== undefined) suites[suite].passed = detail.passed as number;
      if (detail.failed !== undefined) suites[suite].failed = detail.failed as number;
      if (detail.total !== undefined) suites[suite].total = detail.total as number;
      if (detail.duration !== undefined) suites[suite].duration = detail.duration as number;
      if (detail.currentTest) suites[suite].currentTest = detail.currentTest as string;
      if ((detail.status as string) === "completed") {
        suites[suite].status = (detail.failed as number) > 0 ? "failed" : "passed";
        suites[suite].currentTest = undefined; // Clear when done
      }
    } else if (ev.event === "completed") {
      suites[suite].status = (detail.failed as number) > 0 ? "failed" : "passed";
      if (detail.passed !== undefined) suites[suite].passed = detail.passed as number;
      if (detail.failed !== undefined) suites[suite].failed = detail.failed as number;
      if (detail.total !== undefined) suites[suite].total = detail.total as number;
      if (detail.duration !== undefined) suites[suite].duration = detail.duration as number;
      if (detail.failures) suites[suite].failures = detail.failures as TestFailure[];
    } else if (ev.event === "failed") {
      suites[suite].status = "failed";
      if (detail.passed !== undefined) suites[suite].passed = detail.passed as number;
      if (detail.failed !== undefined) suites[suite].failed = detail.failed as number;
      if (detail.total !== undefined) suites[suite].total = detail.total as number;
      if (detail.failures) suites[suite].failures = detail.failures as TestFailure[];
    }
  }

  return Object.values(suites).sort((a, b) => {
    const aOrder = SUITE_CONFIG[a.suite]?.order ?? 99;
    const bOrder = SUITE_CONFIG[b.suite]?.order ?? 99;
    return aOrder - bOrder;
  });
}

// ── Sub-components ──

function SuiteCard({ suite }: { suite: TestSuiteData }) {
  const [expanded, setExpanded] = useState(false);
  const colors = STATUS_COLORS[suite.status] || STATUS_COLORS.pending;
  const Icon = colors.icon;
  const hasFailures = suite.failures && suite.failures.length > 0;
  const showExpand = hasFailures || suite.status === "active";

  const progressPct = suite.total && suite.total > 0
    ? Math.round(((suite.passed || 0) + (suite.failed || 0)) / suite.total * 100)
    : 0;

  return (
    <div className={`rounded-lg border ${colors.border} ${colors.bg} overflow-hidden`}>
      <button
        onClick={() => showExpand && setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
        disabled={!showExpand}
      >
        <Icon className={`w-4 h-4 flex-shrink-0 ${colors.text} ${suite.status === "active" ? "animate-spin" : ""}`} />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${colors.text}`}>{suite.label}</span>
            {suite.total !== undefined && (
              <span className="text-[10px] text-zinc-500">
                {suite.passed !== undefined ? `${suite.passed}` : "0"}
                {suite.failed !== undefined && suite.failed > 0 && (
                  <span className="text-red-400">/{suite.failed}✗</span>
                )}
                /{suite.total}
              </span>
            )}
            {suite.currentTest && suite.status === "active" && (
              <span className="text-[10px] text-blue-400/70 truncate max-w-[180px]" title={suite.currentTest}>
                \u25B8 {suite.currentTest}
              </span>
            )}
          </div>
          
          {/* Progress bar for active/completed suites */}
          {suite.total !== undefined && suite.total > 0 && (
            <div className="mt-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  suite.status === "failed" ? "bg-red-500" : suite.status === "passed" ? "bg-emerald-500" : "bg-blue-500"
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {suite.duration !== undefined && (
            <span className="text-[10px] text-zinc-500 font-mono">{formatDuration(suite.duration)}</span>
          )}
          {showExpand && (
            expanded
              ? <ChevronDown className="w-3 h-3 text-zinc-500" />
              : <ChevronRight className="w-3 h-3 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Failure details */}
      {expanded && hasFailures && (
        <div className="px-3 pb-2.5 border-t border-zinc-800">
          <div className="mt-2 space-y-1.5">
            {suite.failures!.map((f, i) => (
              <div key={i} className="text-[11px] leading-tight">
                <div className="flex items-start gap-1.5">
                  <XCircle className="w-3 h-3 text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-red-300 font-medium">{f.test}</span>
                    {f.class && <span className="text-zinc-500"> ({f.class})</span>}
                    <p className="text-zinc-400 mt-0.5">{f.message}</p>
                    {f.file && (
                      <p className="text-zinc-600 font-mono text-[10px]">
                        {f.file}{f.line ? `:${f.line}` : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OverallProgress({ suites, startedAt }: { suites: TestSuiteData[]; startedAt?: string | null }) {
  const [elapsed, setElapsed] = useState(0);
  const totalTests = suites.reduce((sum, s) => sum + (s.total || 0), 0);
  const passedTests = suites.reduce((sum, s) => sum + (s.passed || 0), 0);
  const failedTests = suites.reduce((sum, s) => sum + (s.failed || 0), 0);
  const completedSuites = suites.filter(s => s.status === "passed" || s.status === "failed").length;
  const totalSuites = suites.length;
  const anyActive = suites.some(s => s.status === "active");
  const anyFailed = suites.some(s => s.status === "failed");
  const allPassed = suites.every(s => s.status === "passed" || s.status === "skipped");
  const maxTimeout = suites.reduce((sum, s) => sum + s.timeoutSeconds, 0);

  useEffect(() => {
    if (!startedAt || !anyActive) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.round((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, anyActive]);

  const timeoutPct = maxTimeout > 0 ? Math.min((elapsed / maxTimeout) * 100, 100) : 0;
  const isWarning = timeoutPct > 70;
  const isOver = elapsed >= maxTimeout;

  return (
    <div className="space-y-2">
      {/* Summary line */}
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-zinc-400">
          {completedSuites}/{totalSuites} suites
          {totalTests > 0 && (
            <> · {passedTests + failedTests}/{totalTests} tests</>
          )}
          {failedTests > 0 && (
            <span className="text-red-400 ml-1">({failedTests} failed)</span>
          )}
        </span>
        {anyActive && (
          <span className={`font-mono ${isOver ? "text-red-400" : isWarning ? "text-amber-400" : "text-zinc-500"}`}>
            {formatDuration(elapsed)} / {formatDuration(maxTimeout)}
          </span>
        )}
        {allPassed && <span className="text-emerald-400 font-medium">All passed ✓</span>}
      </div>

      {/* Overall timeout bar */}
      {anyActive && (
        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${
              isOver ? "bg-red-500" : isWarning ? "bg-amber-500" : "bg-blue-500"
            }`}
            style={{ width: `${timeoutPct}%` }}
          />
        </div>
      )}

      {/* Timeout warning */}
      {isOver && anyActive && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
          <span className="text-[11px] text-amber-300">
            Tests exceeded expected duration ({formatDuration(maxTimeout)}). May be stuck.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Main Component ──

export default function TestProgressPanel({ storyId, scope = "app", startedAt, onLoopBack }: TestProgressPanelProps) {
  const [suites, setSuites] = useState<TestSuiteData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cockpit/lifecycle/events?storyId=${storyId}&stepId=test&limit=100`);
      if (!res.ok) return;
      const data = await res.json();
      const parsed = parseSuitesFromEvents(data.events || [], scope);
      setSuites(parsed);
    } catch (err) {
      console.error("Failed to fetch test events:", err);
    } finally {
      setLoading(false);
    }
  }, [storyId, scope]);

  useEffect(() => {
    fetchEvents();
    // Poll while any suite is active
    const interval = setInterval(fetchEvents, 10000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const anyFailed = suites.some(s => s.status === "failed");
  const allDone = suites.length > 0 && suites.every(s => s.status === "passed" || s.status === "failed" || s.status === "skipped");
  const failedSuites = suites.filter(s => s.status === "failed");

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-zinc-500 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading test progress...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Overall progress */}
      <OverallProgress suites={suites} startedAt={startedAt} />

      {/* Suite cards */}
      <div className="space-y-1.5">
        {suites.map(suite => (
          <SuiteCard key={suite.suite} suite={suite} />
        ))}
      </div>

      {/* Recovery actions on failure */}
      {anyFailed && allDone && onLoopBack && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => {
              const reasons = failedSuites.map(s =>
                `${s.label}: ${s.failures?.map(f => f.test).join(", ") || "failed"}`
              ).join("; ");
              onLoopBack("loop-test-to-implement", reasons);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
              text-amber-300 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Auto-fix (AI)
          </button>
          <button
            onClick={() => onLoopBack("loop-review-to-deliberation", "Test failures indicate architectural issue")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
              text-zinc-400 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
          >
            Back to Deliberation
          </button>
          <button
            onClick={() => onLoopBack("fix-manually")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium
              text-zinc-500 bg-zinc-800/50 border border-zinc-700/50 hover:bg-zinc-800 transition-colors"
          >
            Fix Manually
          </button>
        </div>
      )}
    </div>
  );
}
