'use client';

import { useState } from 'react';
import { CircleDot, CheckCircle2, Tag, RefreshCw, ExternalLink } from 'lucide-react';
import type { GithubIssuesData, GithubIssue, GithubLabel, RunAction } from '../types';
import { formatTimeAgo } from '../utils';
import { LabelBadge } from './shared';

interface GithubIssuesTabProps {
  githubIssues: GithubIssuesData;
  runAction: RunAction;
  actionLoading: string | null;
}

const PRIORITY_COLUMNS = [
  { key: 'high', label: 'High', color: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-400' },
  { key: 'medium', label: 'Medium', color: 'text-amber-400', border: 'border-amber-500/30', dot: 'bg-amber-400' },
  { key: 'low', label: 'Low', color: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-400' },
  { key: 'other', label: 'Other', color: 'text-zinc-400', border: 'border-zinc-600/30', dot: 'bg-zinc-400' },
] as const;

function getIssuePriority(issue: GithubIssue): string {
  for (const label of issue.labels) {
    if (label.name === 'priority:high' || label.name === 'priority:critical') return 'high';
    if (label.name === 'priority:medium') return 'medium';
    if (label.name === 'priority:low') return 'low';
  }
  return 'other';
}

function IssueCard({
  issue,
  expanded,
  onToggle,
}: {
  issue: GithubIssue;
  expanded: boolean;
  onToggle: () => void;
}) {
  // Filter out priority labels from display (already shown by column)
  const displayLabels = issue.labels.filter((l) => !l.name.startsWith('priority:'));

  return (
    <div
      className="p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30 hover:bg-zinc-800/60 transition cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">
          {issue.state === 'open' ? (
            <CircleDot className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-zinc-200 font-medium leading-tight line-clamp-2">
              #{issue.number} {issue.title}
            </span>
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 hover:text-zinc-300 transition shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
          {issue.body && !expanded && (
            <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
              {issue.body.replace(/[#*`>\[\]]/g, '').slice(0, 150)}
            </p>
          )}
          {displayLabels.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              {displayLabels.map((label) => (
                <LabelBadge key={label.name} label={label} />
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {issue.milestone && (
              <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                <Tag className="w-2.5 h-2.5" /> {issue.milestone}
              </span>
            )}
            {issue.assignee && (
              <span className="text-[10px] text-zinc-500">→ {issue.assignee}</span>
            )}
            <span className="text-[10px] text-zinc-600">{formatTimeAgo(issue.updatedAt)}</span>
          </div>
        </div>
      </div>

      {expanded && issue.body && (
        <div className="mt-2 pt-2 border-t border-zinc-700/30">
          <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap font-sans leading-relaxed max-h-60 overflow-y-auto">
            {issue.body}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function GithubIssuesTab({ githubIssues, runAction, actionLoading }: GithubIssuesTabProps) {
  const [issueFilter, setIssueFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);

  // Deduplicated non-priority labels for filter pills
  const allLabels: GithubLabel[] = [];
  const seen = new Set<string>();
  for (const issue of githubIssues.items) {
    for (const label of issue.labels) {
      if (!label.name.startsWith('priority:') && !seen.has(label.name)) {
        seen.add(label.name);
        allLabels.push(label);
      }
    }
  }
  allLabels.sort((a, b) => a.name.localeCompare(b.name));

  const filtered = githubIssues.items.filter((i) => {
    if (issueFilter !== 'all' && i.state !== issueFilter) return false;
    if (labelFilter && !i.labels.some((l) => l.name === labelFilter)) return false;
    return true;
  });

  // Group by priority
  const columns = PRIORITY_COLUMNS.map((col) => ({
    ...col,
    issues: filtered.filter((i) => getIssuePriority(i) === col.key),
  })).filter((col) => col.issues.length > 0);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-green-400" /> GitHub Issues
          <span className="text-xs font-normal text-zinc-500 ml-1">
            {githubIssues.open} open · {githubIssues.closed} recently closed
          </span>
        </h2>
        <div className="flex items-center gap-2">
          {githubIssues.lastSyncedAt && (
            <span className="text-[10px] text-zinc-600">
              Synced {formatTimeAgo(githubIssues.lastSyncedAt)}
            </span>
          )}
          <button
            onClick={() => runAction('sync-github-issues')}
            disabled={actionLoading !== null}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${actionLoading === 'sync-github-issues' ? 'animate-spin' : ''}`} />
            Sync
          </button>
          <div className="flex bg-zinc-800 rounded-lg border border-zinc-700 p-0.5">
            {(['open', 'closed', 'all'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setIssueFilter(f)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  issueFilter === f
                    ? 'bg-zinc-700 text-zinc-200'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Label filters */}
      {allLabels.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <button
            onClick={() => setLabelFilter(null)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium border transition ${
              labelFilter === null
                ? 'bg-zinc-700 text-zinc-200 border-zinc-600'
                : 'bg-zinc-800/50 text-zinc-500 border-zinc-700/50 hover:text-zinc-300'
            }`}
          >
            All labels
          </button>
          {allLabels.map((label) => (
            <button
              key={label.name}
              onClick={() => setLabelFilter(labelFilter === label.name ? null : label.name)}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border transition"
              style={{
                backgroundColor: labelFilter === label.name ? `#${label.color}30` : `#${label.color}10`,
                borderColor: labelFilter === label.name ? `#${label.color}60` : `#${label.color}25`,
                color: labelFilter === label.name ? `#${label.color}` : `#${label.color}90`,
              }}
            >
              {label.name}
            </button>
          ))}
        </div>
      )}

      {/* Priority columns */}
      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-sm">No {issueFilter === 'all' ? '' : issueFilter + ' '}issues found{labelFilter ? ` matching "${labelFilter}"` : ''}.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {columns.map((col) => (
            <div key={col.key} className={`border ${col.border} rounded-lg bg-zinc-800/20`}>
              {/* Column header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/30">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{col.issues.length}</span>
              </div>
              {/* Issue cards */}
              <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
                {col.issues.map((issue) => (
                  <IssueCard
                    key={issue.number}
                    issue={issue}
                    expanded={expandedIssue === issue.number}
                    onToggle={() => setExpandedIssue(expandedIssue === issue.number ? null : issue.number)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
