'use client';

import { useState } from 'react';
import { CircleDot, CheckCircle2, ChevronDown, ChevronUp, Tag } from 'lucide-react';
import type { GithubIssuesData, GithubLabel } from '../types';
import { formatTimeAgo } from '../utils';
import { LabelBadge } from './shared';

interface GithubIssuesTabProps {
  githubIssues: GithubIssuesData;
}

export default function GithubIssuesTab({ githubIssues }: GithubIssuesTabProps) {
  const [issueFilter, setIssueFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [issuesExpanded, setIssuesExpanded] = useState(false);

  // Deduplicated labels across all issues for filter pills
  const allLabels: GithubLabel[] = [];
  const seen = new Set<string>();
  for (const issue of githubIssues.items) {
    for (const label of issue.labels) {
      if (!seen.has(label.name)) {
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
  const displayed = issuesExpanded ? filtered : filtered.slice(0, 8);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <CircleDot className="w-4 h-4 text-green-400" /> GitHub Issues
          <span className="text-xs font-normal text-zinc-500 ml-1">
            {githubIssues.open} open · {githubIssues.closed} recently closed
          </span>
        </h2>
        <div className="flex items-center gap-2">
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
          <button
            onClick={() => setIssuesExpanded(!issuesExpanded)}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:text-zinc-300 transition"
          >
            {issuesExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {issuesExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {allLabels.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
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

      {filtered.length === 0 ? (
        <p className="text-zinc-500 text-sm">No {issueFilter === 'all' ? '' : issueFilter + ' '}issues found{labelFilter ? ` matching "${labelFilter}"` : ''}.</p>
      ) : (
        <div className="space-y-1.5">
          {displayed.map((issue) => (
            <div
              key={issue.number}
              className="flex items-start gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30 hover:bg-zinc-800/60 transition"
            >
              <div className="mt-0.5">
                {issue.state === 'open' ? (
                  <CircleDot className="w-4 h-4 text-green-400" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-purple-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-200 hover:text-white transition font-medium truncate"
                  >
                    #{issue.number} {issue.title}
                  </a>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {issue.labels.map((label) => (
                    <LabelBadge key={label.name} label={label} />
                  ))}
                  {issue.milestone && (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-0.5">
                      <Tag className="w-2.5 h-2.5" /> {issue.milestone}
                    </span>
                  )}
                  {issue.assignee && (
                    <span className="text-[10px] text-zinc-500">
                      → {issue.assignee}
                    </span>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs text-zinc-500">{formatTimeAgo(issue.updatedAt)}</span>
              </div>
            </div>
          ))}
          {!issuesExpanded && filtered.length > 8 && (
            <button
              onClick={() => setIssuesExpanded(true)}
              className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition"
            >
              Show all {filtered.length} issues...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
