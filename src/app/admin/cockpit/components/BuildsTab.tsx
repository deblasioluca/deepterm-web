'use client';

import { useState } from 'react';
import { Cpu, ExternalLink, Play, FlaskConical, Loader2 } from 'lucide-react';
import type { CiBuild } from '../types';
import { formatTimeAgo } from '../utils';
import { ConclusionBadge } from './shared';

interface BuildsTabProps {
  builds: CiBuild[];
}

function QuickAction({ icon: Icon, label, onClick, loading, color }: {
  icon: any; label: string; onClick: () => void; loading: boolean; color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md border transition-colors disabled:opacity-50 ${color}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Icon className="w-3.5 h-3.5" />}
      {label}
    </button>
  );
}

export default function BuildsTab({ builds }: BuildsTabProps) {
  const [triggerState, setTriggerState] = useState<Record<string, 'idle' | 'loading' | 'success' | 'error'>>({});

  async function dispatchWorkflow(key: string, repo: string, workflow: string) {
    setTriggerState(s => ({ ...s, [key]: 'loading' }));
    try {
      const res = await fetch('/api/admin/cockpit/github-dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, workflow }),
      });
      if (res.ok) {
        setTriggerState(s => ({ ...s, [key]: 'success' }));
        setTimeout(() => setTriggerState(s => ({ ...s, [key]: 'idle' })), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        console.error('Dispatch failed:', data);
        setTriggerState(s => ({ ...s, [key]: 'error' }));
        setTimeout(() => setTriggerState(s => ({ ...s, [key]: 'idle' })), 3000);
      }
    } catch {
      setTriggerState(s => ({ ...s, [key]: 'error' }));
      setTimeout(() => setTriggerState(s => ({ ...s, [key]: 'idle' })), 3000);
    }
  }

  function buttonColor(key: string) {
    const state = triggerState[key] || 'idle';
    if (state === 'success') return 'border-emerald-600 bg-emerald-900/30 text-emerald-300';
    if (state === 'error') return 'border-red-600 bg-red-900/30 text-red-300';
    return 'border-zinc-600 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700/60 hover:border-zinc-500';
  }

  function buttonLabel(key: string, base: string) {
    const state = triggerState[key] || 'idle';
    if (state === 'success') return 'Triggered ✓';
    if (state === 'error') return 'Failed ✗';
    return base;
  }

  return (
    <div className="space-y-4">
      {/* Quick Actions */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          <Play className="w-4 h-4 text-emerald-400" /> Quick Actions
        </h2>
        <div className="flex flex-wrap gap-2">
          <QuickAction
            icon={Play}
            label={buttonLabel('e2e-web', 'Run E2E Tests (Web)')}
            onClick={() => dispatchWorkflow('e2e-web', 'deepterm-web', 'e2e.yml')}
            loading={triggerState['e2e-web'] === 'loading'}
            color={buttonColor('e2e-web')}
          />
          <QuickAction
            icon={FlaskConical}
            label={buttonLabel('pr-check', 'Trigger PR Check (App)')}
            onClick={() => dispatchWorkflow('pr-check', 'deepterm', 'pr-check.yml')}
            loading={triggerState['pr-check'] === 'loading'}
            color={buttonColor('pr-check')}
          />
        </div>
      </div>

      {/* Build History */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400" /> Recent CI Builds
        </h2>
        {builds.length === 0 ? (
          <p className="text-zinc-500 text-sm">No builds recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {builds.map((build) => (
              <div key={build.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                <ConclusionBadge conclusion={build.conclusion} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 truncate">
                    {build.commitMessage || build.workflow}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {build.branch} · {build.workflow}
                    {build.duration ? ` · ${build.duration}s` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">{formatTimeAgo(build.createdAt)}</span>
                  {build.url && (
                    <a href={build.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
