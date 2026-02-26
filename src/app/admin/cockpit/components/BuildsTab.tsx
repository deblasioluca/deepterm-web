'use client';

import { Cpu, ExternalLink } from 'lucide-react';
import type { CiBuild } from '../types';
import { formatTimeAgo } from '../utils';
import { ConclusionBadge } from './shared';

interface BuildsTabProps {
  builds: CiBuild[];
}

export default function BuildsTab({ builds }: BuildsTabProps) {
  return (
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
  );
}
