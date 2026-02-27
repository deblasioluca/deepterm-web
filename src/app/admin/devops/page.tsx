'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Zap, CircleDot, Map, Milestone, GitPullRequest, Cpu, Workflow,
  Loader2, XCircle, RefreshCw, Wifi, WifiOff, Play, Send,
} from 'lucide-react';
import { formatTimeAgo } from '../cockpit/utils';
import TriageQueueTab from '../cockpit/components/TriageQueueTab';
import GithubIssuesTab from '../cockpit/components/GithubIssuesTab';
import PlanningTab from '../cockpit/components/PlanningTab';
import LifecycleTab from '../cockpit/components/LifecycleTab';
import BuildsTab from '../cockpit/components/BuildsTab';
import PipelinesTab from '../cockpit/components/PipelinesTab';
import CodeAndPRsTab from './components/CodeAndPRsTab';

const TABS = [
  { key: 'triage', label: 'Triage', icon: Zap },
  { key: 'backlog', label: 'Backlog', icon: CircleDot },
  { key: 'planning', label: 'Planning', icon: Map },
  { key: 'lifecycle', label: 'Lifecycle', icon: Milestone },
  { key: 'code', label: 'Code & PRs', icon: GitPullRequest },
  { key: 'builds', label: 'Builds', icon: Cpu },
  { key: 'pipelines', label: 'Pipelines', icon: Workflow },
] as const;

type TabKey = typeof TABS[number]['key'];

function useLazyTabData<T>(url: string, active: boolean, refreshInterval = 30000) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(url);
      if (res.ok) setData(await res.json());
    } catch { /* silent */ } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, [url]);

  useEffect(() => {
    if (active && !loaded) fetchData();
  }, [active, loaded, fetchData]);

  useEffect(() => {
    if (!active) return;
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [active, fetchData, refreshInterval]);

  return { data, loading: loading && !data, refetch: fetchData };
}

export default function DevOpsPage() {
  const [coreData, setCoreData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('triage');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  const fetchCore = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/core');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCoreData(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCore();
    if (!autoRefresh) return;
    const interval = setInterval(fetchCore, 30000);
    return () => clearInterval(interval);
  }, [fetchCore, autoRefresh]);

  const backlog = useLazyTabData<any>('/api/admin/cockpit/tab/backlog', activeTab === 'backlog');
  const triage = useLazyTabData<any>('/api/admin/cockpit/tab/triage', activeTab === 'triage');
  const healthTab = useLazyTabData<any>('/api/admin/cockpit/tab/health', activeTab === 'builds');
  const planningData = useLazyTabData<any>('/api/admin/cockpit/tab/planning', activeTab === 'planning');
  const pipelinesData = useLazyTabData<any>('/api/admin/cockpit/tab/pipelines', activeTab === 'pipelines');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (error && !coreData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <XCircle className="w-12 h-12 text-red-400" />
        <p className="text-red-400">{error}</p>
        <button onClick={fetchCore} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700">Retry</button>
      </div>
    );
  }

  if (!coreData) return null;

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
        fetchCore();
      } else {
        setActionResult({ msg: result.error || 'Failed', ok: false });
      }
    } catch (e: unknown) {
      setActionResult({ msg: e instanceof Error ? e.message : 'Failed', ok: false });
    } finally {
      setActionLoading(null);
    }
  };

  const triageCount = coreData.triageCount || 0;
  const githubIssues = backlog.data || { open: 0, closed: 0, items: [], lastSyncedAt: null };
  const triageQueue = triage.data || { issues: [], ideas: [] };
  const buildsData = healthTab.data?.builds || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">DevOps</h1>
          <p className="text-sm text-zinc-400 mt-1">Development pipeline &amp; CI/CD operations</p>
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
            onClick={fetchCore}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
          {coreData.timestamp && (
            <span className="text-xs text-zinc-500">Updated {formatTimeAgo(coreData.timestamp)}</span>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => runAction('trigger-build', { workflow: 'pr-check.yml', branch: 'main' })} disabled={actionLoading !== null}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50">
          <Play className="w-3.5 h-3.5 text-emerald-400" /> Trigger CI Build
        </button>
        <button onClick={() => runAction('trigger-build', { workflow: 'e2e.yml', branch: 'main', repo: 'deepterm-web' })} disabled={actionLoading !== null}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50">
          <Play className="w-3.5 h-3.5 text-blue-400" /> Run E2E Tests
        </button>
        {actionLoading && <span className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> {actionLoading}...</span>}
        {actionResult && <span className={`text-xs ${actionResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{actionResult.msg}</span>}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          const badge = tab.key === 'triage' && triageCount > 0 ? triageCount : null;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                isActive ? 'bg-zinc-800 text-white border border-zinc-700' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 border border-transparent'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
              {badge !== null && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">{badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'triage' && (triage.loading ? <TabLoader /> : <TriageQueueTab triageQueue={triageQueue} runAction={runAction} actionLoading={actionLoading} />)}
      {activeTab === 'backlog' && (backlog.loading ? <TabLoader /> : <GithubIssuesTab githubIssues={githubIssues} runAction={runAction} actionLoading={actionLoading} />)}
      {activeTab === 'planning' && <PlanningTab planning={planningData.data || { epics: [], unassignedStories: [] }} githubIssues={githubIssues} runAction={runAction} actionLoading={actionLoading} onDataChange={() => { planningData.refetch(); fetchCore(); }} />}
      {activeTab === 'lifecycle' && <LifecycleTab />}
      {activeTab === 'code' && <CodeAndPRsTab />}
      {activeTab === 'builds' && <BuildsTab builds={buildsData} />}
      {activeTab === 'pipelines' && <PipelinesTab pipelines={pipelinesData.data || { connected: false, dags: [], activeRuns: [], recentRuns: [] }} runAction={runAction} actionLoading={actionLoading} />}
    </div>
  );
}

function TabLoader() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
    </div>
  );
}
