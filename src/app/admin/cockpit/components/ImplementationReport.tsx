'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, FileText, CheckCircle2, ExternalLink, Zap, X } from 'lucide-react';
import type { ImplementationReportData } from '../types';

interface ImplementationReportProps {
  targetType: 'story' | 'epic';
  targetId: string;
  onClose?: () => void;
}

function parseJsonArray(json: string): string[] {
  try { return JSON.parse(json); }
  catch { return []; }
}

function parsePRs(json: string): Array<{ number: number; title: string; url: string; state: string }> {
  try { return JSON.parse(json); }
  catch { return []; }
}

export default function ImplementationReport({ targetType, targetId, onClose }: ImplementationReportProps) {
  const [report, setReport] = useState<ImplementationReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cockpit/reports/generate?${targetType}Id=${targetId}`);
      if (res.ok) {
        const data = await res.json();
        if (data) setReport(data);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [targetType, targetId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const generateReport = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cockpit/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`${targetType}Id`]: targetId }),
      });
      const json = await res.json();
      if (res.ok) {
        setReport(json);
      } else {
        setError(json.error || 'Failed to generate report');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-medium text-white">Implementation Report</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-zinc-500 mb-3">
          No report yet. Generate one from linked GitHub PRs.
        </p>
        {error && (
          <p className="text-xs text-red-400 mb-3">{error}</p>
        )}
        <button
          onClick={generateReport}
          disabled={generating}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {generating ? 'Generating...' : 'Auto-Populate from GitHub'}
        </button>
      </div>
    );
  }

  const files = parseJsonArray(report.filesChanged);
  const tests = parseJsonArray(report.testsAdded);
  const testsUpd = parseJsonArray(report.testsUpdated);
  const docs = parseJsonArray(report.docsUpdated);
  const helpPages = parseJsonArray(report.helpPagesUpdated);
  const prs = parsePRs(report.prNumbers);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-white">Implementation Report</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            {report.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateReport}
            disabled={generating}
            className="flex items-center gap-1 px-2 py-1 text-[10px] text-purple-400 hover:bg-purple-500/10 rounded transition disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Zap className="w-2.5 h-2.5" />}
            Refresh
          </button>
          {onClose && (
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* PRs */}
      {prs.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Pull Requests</h4>
          <div className="space-y-1">
            {prs.map(pr => (
              <a
                key={pr.number}
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300 transition"
              >
                <ExternalLink className="w-3 h-3" />
                #{pr.number}: {pr.title}
                <span className={`px-1 py-0.5 rounded text-[9px] ${pr.state === 'closed' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                  {pr.state}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Files Changed */}
      {files.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Files Changed ({files.length})
          </h4>
          <div className="max-h-32 overflow-y-auto space-y-0.5">
            {files.map((f, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400">{f}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tests */}
      {tests.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-400" />
            Tests ({tests.length})
          </h4>
          <div className="space-y-0.5">
            {tests.map((t, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400">{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* Tests Updated */}
      {testsUpd.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-amber-400" />
            Tests Updated ({testsUpd.length})
          </h4>
          <div className="space-y-0.5">
            {testsUpd.map((t, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400">{t}</div>
            ))}
          </div>
        </div>
      )}

      {/* Docs */}
      {docs.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Documentation ({docs.length})
          </h4>
          <div className="space-y-0.5">
            {docs.map((d, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400">{d}</div>
            ))}
          </div>
        </div>
      )}

      {/* Help Pages */}
      {helpPages.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            Help Pages ({helpPages.length})
          </h4>
          <div className="space-y-0.5">
            {helpPages.map((h, i) => (
              <div key={i} className="text-[11px] font-mono text-zinc-400">{h}</div>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      {report.summary && (
        <div>
          <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">Summary</h4>
          <p className="text-xs text-zinc-300">{report.summary}</p>
        </div>
      )}
    </div>
  );
}
