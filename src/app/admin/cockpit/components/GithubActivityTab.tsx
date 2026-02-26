'use client';

import { GitBranch, ExternalLink } from 'lucide-react';
import type { GithubEvent } from '../types';
import { formatTimeAgo } from '../utils';
import { EventIcon } from './shared';

interface GithubActivityTabProps {
  events: GithubEvent[];
}

export default function GithubActivityTab({ events }: GithubActivityTabProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <GitBranch className="w-4 h-4 text-blue-400" /> GitHub Activity
      </h2>
      {events.length === 0 ? (
        <p className="text-zinc-500 text-sm">No events recorded yet.</p>
      ) : (
        <div className="space-y-2">
          {events.map((event) => (
            <div key={event.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
              <EventIcon type={event.eventType} />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-zinc-200 truncate">
                  {event.summary || `${event.eventType} on ${event.repo}`}
                </div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {event.actor && `${event.actor} · `}{event.branch || event.repo}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">{formatTimeAgo(event.createdAt)}</span>
                {event.url && (
                  <a href={event.url} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300">
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
