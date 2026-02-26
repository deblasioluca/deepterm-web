'use client';

import { Bug, Lightbulb, Zap, ThumbsUp, ThumbsDown, Pause } from 'lucide-react';
import type { TriageQueue, RunAction } from '../types';
import { formatTimeAgo } from '../utils';

interface TriageQueueTabProps {
  triageQueue: TriageQueue;
  runAction: RunAction;
  actionLoading: string | null;
}

export default function TriageQueueTab({ triageQueue, runAction, actionLoading }: TriageQueueTabProps) {
  if (triageQueue.issues.length === 0 && triageQueue.ideas.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" /> Triage Queue
        </h2>
        <p className="text-zinc-500 text-sm">No items pending triage.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-amber-400" /> Triage Queue
        <span className="text-xs font-normal text-zinc-500 ml-1">
          {triageQueue.issues.length} issues · {triageQueue.ideas.length} ideas pending
        </span>
      </h2>

      {/* Pending Issues */}
      {triageQueue.issues.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Bug Reports</h3>
          <div className="space-y-2">
            {triageQueue.issues.map((issue) => (
              <div key={issue.id} className="flex items-start gap-3 p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                <Bug className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 font-medium">{issue.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{issue.description}</div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    {issue.reporter} · {issue.area} · {formatTimeAgo(issue.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => runAction('triage-issue', { issueId: issue.id, decision: 'approve' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                    title="Approve"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => runAction('triage-issue', { issueId: issue.id, decision: 'defer' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
                    title="Defer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => runAction('triage-issue', { issueId: issue.id, decision: 'reject' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                    title="Reject"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Ideas */}
      {triageQueue.ideas.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Feature Ideas</h3>
          <div className="space-y-2">
            {triageQueue.ideas.map((idea) => (
              <div key={idea.id} className="flex items-start gap-3 p-3 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                <Lightbulb className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 font-medium">{idea.title}</div>
                  <div className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{idea.description}</div>
                  <div className="text-[10px] text-zinc-600 mt-1">
                    {idea.author} · {idea.category} · {idea.votes} votes · {formatTimeAgo(idea.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => runAction('triage-idea', { ideaId: idea.id, decision: 'approve' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50"
                    title="Approve → Planned"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => runAction('triage-idea', { ideaId: idea.id, decision: 'defer' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50"
                    title="Defer"
                  >
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => runAction('triage-idea', { ideaId: idea.id, decision: 'reject' })}
                    disabled={actionLoading !== null}
                    className="p-1.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                    title="Decline"
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
