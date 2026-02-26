'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, BarChart3, DollarSign, Zap, Clock, AlertTriangle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';
import type { AIUsageSummary, AIUsageTimeline, AIUsageLogEntry } from '../types';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
] as const;

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#6C5CE7',
  openai: '#10A37F',
  google: '#4285F4',
  mistral: '#FF7000',
  groq: '#F55036',
};

const CATEGORY_ICONS: Record<string, string> = {
  deliberation: '\u{1F3D7}',
  review: '\u{1F50D}',
  planning: '\u{1F4CB}',
  agent: '\u{1F916}',
  ci: '\u{1F527}',
  reports: '\u{1F4C4}',
  unknown: '\u{2753}',
};

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${ms}ms`;
}

export default function AIUsageTab() {
  const [period, setPeriod] = useState<string>('month');
  const [summary, setSummary] = useState<AIUsageSummary | null>(null);
  const [timeline, setTimeline] = useState<AIUsageTimeline | null>(null);
  const [recentLogs, setRecentLogs] = useState<AIUsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, timelineRes, detailsRes] = await Promise.all([
        fetch(`/api/admin/cockpit/ai-usage/summary?period=${period}`),
        fetch(`/api/admin/cockpit/ai-usage/timeline?period=${period}`),
        fetch('/api/admin/cockpit/ai-usage/details?limit=15'),
      ]);

      if (summaryRes.ok) setSummary(await summaryRes.json());
      if (timelineRes.ok) setTimeline(await timelineRes.json());
      if (detailsRes.ok) {
        const d = await detailsRes.json();
        setRecentLogs(d.logs || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const totalCost = summary?.totals.costCents || 0;

  return (
    <div className="space-y-4">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-white">AI Token Usage</h2>
        </div>
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                period === p.key
                  ? 'bg-zinc-700 text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
            label="Total Cost"
            value={`$${summary.totals.costDollars}`}
            sub={`${summary.totals.calls} calls`}
          />
          <SummaryCard
            icon={<Zap className="w-4 h-4 text-amber-400" />}
            label="Total Tokens"
            value={formatTokens(summary.totals.totalTokens)}
            sub={`${formatTokens(summary.totals.inputTokens)} in / ${formatTokens(summary.totals.outputTokens)} out`}
          />
          <SummaryCard
            icon={<Clock className="w-4 h-4 text-blue-400" />}
            label="Avg Latency"
            value={formatDuration(summary.totals.avgDurationMs)}
            sub={`${summary.totals.calls} calls`}
          />
          <SummaryCard
            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
            label="Error Rate"
            value={`${summary.totals.errorRate}%`}
            sub={`${summary.totals.errorCount} errors`}
          />
        </div>
      )}

      {/* Provider Breakdown */}
      {summary && summary.byProvider.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">By Provider</h3>
          <div className="space-y-2">
            {summary.byProvider
              .sort((a, b) => b.costCents - a.costCents)
              .map(p => {
                const pct = totalCost > 0 ? (p.costCents / totalCost) * 100 : 0;
                return (
                  <div key={p.provider} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-300 w-20 capitalize">{p.provider}</span>
                    <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(pct, 2)}%`,
                          backgroundColor: PROVIDER_COLORS[p.provider] || '#6B7280',
                        }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-16 text-right">${p.costDollars}</span>
                    <span className="text-[10px] text-zinc-500 w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {summary && summary.byCategory.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">By Category</h3>
          <div className="space-y-2">
            {summary.byCategory
              .sort((a, b) => b.costCents - a.costCents)
              .map(c => {
                const pct = totalCost > 0 ? (c.costCents / totalCost) * 100 : 0;
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="text-xs w-28">
                      <span className="mr-1">{CATEGORY_ICONS[c.category] || ''}</span>
                      <span className="text-zinc-300 capitalize">{c.category}</span>
                    </span>
                    <div className="flex-1 h-5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500/60 transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 w-16 text-right">${c.costDollars}</span>
                    <span className="text-[10px] text-zinc-500 w-10 text-right">{pct.toFixed(0)}%</span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Daily Trend Chart */}
      {timeline && timeline.points.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Daily Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={timeline.points}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6C5CE7" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6C5CE7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(d: string) => d.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v: number) => `$${(v / 100).toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#a1a1aa' }}
                formatter={(value: number, name: string) => {
                  if (name === 'costCents') return [`$${(value / 100).toFixed(2)}`, 'Cost'];
                  if (name === 'tokens') return [formatTokens(value), 'Tokens'];
                  if (name === 'calls') return [value, 'Calls'];
                  return [value, name];
                }}
              />
              <Area type="monotone" dataKey="costCents" stroke="#6C5CE7" fillOpacity={1} fill="url(#costGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Activity Breakdown */}
      {summary && summary.byActivity.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Activities</h3>
          <ResponsiveContainer width="100%" height={Math.min(summary.byActivity.length * 28 + 20, 300)}>
            <BarChart data={summary.byActivity.slice(0, 10)} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v: number) => `$${(v / 100).toFixed(2)}`}
              />
              <YAxis
                type="category"
                dataKey="activity"
                tick={{ fontSize: 10, fill: '#a1a1aa' }}
                width={120}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: 8, fontSize: 11 }}
                formatter={(value: number) => [`$${(value / 100).toFixed(2)}`, 'Cost']}
              />
              <Bar dataKey="costCents" radius={[0, 4, 4, 0]}>
                {summary.byActivity.slice(0, 10).map((entry, idx) => (
                  <Cell key={idx} fill={PROVIDER_COLORS[entry.model.includes('claude') ? 'anthropic' : entry.model.includes('gpt') ? 'openai' : entry.model.includes('gemini') ? 'google' : 'mistral'] || '#6C5CE7'} fillOpacity={0.7} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top Consumers */}
      {summary && summary.topConsumers.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Top Consumers (Stories)</h3>
          <div className="space-y-2">
            {summary.topConsumers.map((s, i) => (
              <div key={s.storyId} className="flex items-center gap-3">
                <span className="text-[10px] text-zinc-600 w-4">{i + 1}.</span>
                <span className="text-xs text-zinc-300 flex-1 truncate">{s.title}</span>
                <span className="text-xs text-zinc-400">{s.calls} calls</span>
                <span className="text-xs font-medium text-emerald-400">${s.costDollars}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Calls */}
      {recentLogs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Recent Calls</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 text-[10px] uppercase tracking-wider">
                  <th className="text-left pb-2 font-medium">Time</th>
                  <th className="text-left pb-2 font-medium">Activity</th>
                  <th className="text-left pb-2 font-medium">Model</th>
                  <th className="text-right pb-2 font-medium">Tokens</th>
                  <th className="text-right pb-2 font-medium">Cost</th>
                  <th className="text-right pb-2 font-medium">Duration</th>
                  <th className="text-center pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {recentLogs.map(log => (
                  <tr key={log.id} className="text-zinc-300">
                    <td className="py-1.5 text-zinc-500">
                      {new Date(log.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-1.5 font-mono text-[11px]">{log.activity}</td>
                    <td className="py-1.5 text-zinc-400">{log.model.split('-').slice(0, 2).join('-')}</td>
                    <td className="py-1.5 text-right">{formatTokens(log.totalTokens)}</td>
                    <td className="py-1.5 text-right text-emerald-400">${(log.costCents / 100).toFixed(3)}</td>
                    <td className="py-1.5 text-right text-zinc-500">{formatDuration(log.durationMs)}</td>
                    <td className="py-1.5 text-center">
                      {log.success ? (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      ) : (
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {summary && summary.totals.calls === 0 && (
        <div className="text-center py-12 text-zinc-500 text-xs">
          No AI usage data yet. Usage will be logged automatically when AI calls are made.
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-lg font-bold text-white">{value}</div>
      <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>
    </div>
  );
}
