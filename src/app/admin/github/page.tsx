'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Github, GitPullRequest, GitBranch, GitCommit, Workflow,
  RefreshCw, Wifi, WifiOff, Loader2, XCircle,
} from 'lucide-react';
import PullRequestsFullTab from './components/PullRequestsFullTab';
import ActionsTab from './components/ActionsTab';
import CommitsTab from './components/CommitsTab';
import BranchesTab from './components/BranchesTab';
import { useAdminAI } from '@/components/admin/AdminAIContext';

const REPOS = ['deblasioluca/deepterm'];

const TABS = [
  { key: 'pulls',    label: 'Pull Requests', icon: GitPullRequest },
  { key: 'actions',  label: 'Actions',       icon: Workflow },
  { key: 'commits',  label: 'Commits',       icon: GitCommit },
  { key: 'branches', label: 'Branches',      icon: GitBranch },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function GitHubPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('pulls');
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'GitHub',
      summary: `GitHub integration — tab: ${activeTab}, repo filter: ${selectedRepo || 'all'}`,
      data: { activeTab, selectedRepo, autoRefresh },
    });
    return () => setPageContext(null);
  }, [activeTab, selectedRepo, autoRefresh, setPageContext]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-zinc-800 border border-zinc-700 rounded-xl flex items-center justify-center">
            <Github className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">GitHub</h1>
            <p className="text-sm text-zinc-400 mt-0.5">Repositories, PRs, actions, commits &amp; branches</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Repo filter */}
          <select
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-600"
          >
            <option value="">All repos</option>
            {REPOS.map(r => (
              <option key={r} value={r}>{r.split('/')[1]}</option>
            ))}
          </select>

          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              autoRefresh
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
            }`}
          >
            {autoRefresh ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {autoRefresh ? 'Live' : 'Paused'}
          </button>

          <button
            onClick={handleRefresh}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                isActive
                  ? 'bg-zinc-600 text-white border border-zinc-500'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700/50 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === 'pulls' && (
        <PullRequestsFullTab repo={selectedRepo} autoRefresh={autoRefresh} refreshKey={refreshKey} />
      )}
      {activeTab === 'actions' && (
        <ActionsTab repo={selectedRepo} autoRefresh={autoRefresh} refreshKey={refreshKey} />
      )}
      {activeTab === 'commits' && (
        <CommitsTab repo={selectedRepo} autoRefresh={autoRefresh} refreshKey={refreshKey} />
      )}
      {activeTab === 'branches' && (
        <BranchesTab repo={selectedRepo} autoRefresh={autoRefresh} refreshKey={refreshKey} />
      )}
    </div>
  );
}
