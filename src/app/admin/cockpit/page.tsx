'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Activity, Loader2, XCircle, Wifi, WifiOff,
  RefreshCw, Send, LayoutDashboard, BarChart3,
} from 'lucide-react';
import { formatTimeAgo } from './utils';
import OverviewTab from './components/OverviewTab';
import SystemHealthTab from './components/SystemHealthTab';
import AIUsageTab from './components/AIUsageTab';
import { useAdminAI } from '@/components/admin/AdminAIContext';

const TABS = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'health', label: 'System Health', icon: Activity },
  { key: 'ai-usage', label: 'AI Usage', icon: BarChart3 },
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

export default function CockpitPage() {
  const [coreData, setCoreData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  const { setPageContext } = useAdminAI();
  useEffect(() => {
    setPageContext({
      page: 'Cockpit',
      summary: `System monitoring — ${activeTab} tab`,
      data: { activeTab, autoRefresh },
    });
    return () => setPageContext(null);
  }, [activeTab, autoRefresh, setPageContext]);

  const fetchCore = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/core');
      if (!res.ok) throw new Error("HTTP " + res.status);
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

  const healthTab = useLazyTabData<any>('/api/admin/cockpit/tab/health', activeTab === 'health' || activeTab === 'overview');

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

  const healthData = healthTab.data?.health || coreData.health || {};
  const buildsData = healthTab.data?.builds || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cockpit</h1>
          <p className="text-sm text-zinc-400 mt-1">System monitoring &amp; health</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition ${
              autoRefresh
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
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
        <button onClick={() => runAction('test-whatsapp')} disabled={actionLoading !== null}
          className="flex items-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 hover:border-zinc-600 transition disabled:opacity-50">
          <Send className="w-3.5 h-3.5 text-green-400" /> Test WhatsApp
        </button>
        {actionLoading && <span className="flex items-center gap-1.5 text-xs text-zinc-500"><Loader2 className="w-3 h-3 animate-spin" /> {actionLoading}...</span>}
        {actionResult && <span className={`text-xs ${actionResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>{actionResult.msg}</span>}
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                isActive
                  ? 'bg-zinc-600 text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab stats={coreData.stats} revenue={coreData.revenue} health={healthData} builds={buildsData} />}
      {activeTab === 'health' && (healthTab.loading ? <TabLoader /> : <SystemHealthTab health={healthData} builds={buildsData} />)}
      {activeTab === 'ai-usage' && <AIUsageTab />}
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
