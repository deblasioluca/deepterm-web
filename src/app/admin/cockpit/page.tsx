'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  CircleDot,
  Cpu,
  GitBranch,
  Loader2,
  XCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  Play,
  Send,
  Zap,
  LayoutDashboard,
  Map,
} from 'lucide-react';
import type { CockpitData } from './types';
import { formatTimeAgo } from './utils';
import OverviewTab from './components/OverviewTab';
import GithubIssuesTab from './components/GithubIssuesTab';
import TriageQueueTab from './components/TriageQueueTab';
import PlanningTab from './components/PlanningTab';
import SystemHealthTab from './components/SystemHealthTab';
import BuildsTab from './components/BuildsTab';
import GithubActivityTab from './components/GithubActivityTab';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'backlog', label: 'Backlog', icon: CircleDot },
  { key: 'triage', label: 'Triage', icon: Zap },
  { key: 'planning', label: 'Planning', icon: Map },
  { key: 'health', label: 'System Health', icon: Activity },
  { key: 'builds', label: 'Builds', icon: Cpu },
  { key: 'activity', label: 'Activity', icon: GitBranch },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function CockpitPage() {
  const [data, setData] = useState<CockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData, autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <button onClick={fetchData} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const runAction = async (action: string, payload: Record<string, unknown> = {}) => {
    setActionLoading(action);
    setActionResult(null);
    try {
      const res = await fetch('/api/admin/cockpit/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const result = await res.json();
      if (res.ok) {
        setActionResult({ msg: result.message || 'Done', ok: true });
        fetchData();
      } else {
        setActionResult({ msg: result.error || 'Failed', ok: false });
      }
    } catch (e: unknown) {
      setActionResult({ msg: e instanceof Error ? e.message : 'Failed', ok: false });
    } finally {
      setActionLoading(null);
    }
  };

  const { health, builds, events, stats, githubIssues, triageQueue, revenue, planning } = data;

  const triageCount = triageQueue.issues.length + triageQueue.ideas.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cockpit</h1>
          <p className="text-sm text-zinc-400 mt-1">System overview &amp; operations</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              autoRefresh ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {autoRefresh ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
          {data.timestamp && (
            <span className="text-xs text-zinc-500">
              Updated {formatTimeAgo(data.timestamp)}
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => runAction('trigger-build', { workflow: 'pr-check.yml', branch: 'main' })}
          disabled={actionLoading !== null}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 text-emerald-400" />
          Trigger CI Build
        </button>
        <button
          onClick={() => runAction('test-whatsapp')}
          disabled={actionLoading !== null}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5 text-green-400" />
          Test WhatsApp
        </button>
        {actionLoading && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-500">
            <Loader2 className="w-3 h-3 animate-spin" /> {actionLoading}...
          </span>
        )}
        {actionResult && (
          <span className={`text-xs ${actionResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
            {actionResult.msg}
          </span>
        )}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const badge = tab.key === 'triage' && triageCount > 0 ? triageCount : null;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                isActive
                  ? 'bg-zinc-800 text-white border border-zinc-700'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
              {badge !== null && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab stats={stats} revenue={revenue} health={health} builds={builds} />
      )}
      {activeTab === 'backlog' && (
        <GithubIssuesTab githubIssues={githubIssues} />
      )}
      {activeTab === 'triage' && (
        <TriageQueueTab triageQueue={triageQueue} runAction={runAction} actionLoading={actionLoading} />
      )}
      {activeTab === 'planning' && (
        <PlanningTab
          planning={planning}
          githubIssues={githubIssues}
          runAction={runAction}
          actionLoading={actionLoading}
          onDataChange={fetchData}
        />
      )}
      {activeTab === 'health' && (
        <SystemHealthTab health={health} builds={builds} />
      )}
      {activeTab === 'builds' && (
        <BuildsTab builds={builds} />
      )}
      {activeTab === 'activity' && (
        <GithubActivityTab events={events} />
      )}
    </div>
  );
}
