'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { CircleDot, CheckCircle2, Tag, RefreshCw, ExternalLink } from 'lucide-react';
import type { GithubIssuesData, GithubIssue, GithubLabel, RunAction } from '../types';
import { formatTimeAgo } from '../utils';
import { LabelBadge } from './shared';

// ── Body parsing: extract markdown from JSON wrapper if present ──

function extractBodyMarkdown(raw: string): string {
  if (!raw) return '';

  // Case 1: Body is wrapped in ```json { "title": "...", "body": "..." } ```
  const jsonBlockMatch = raw.match(/```json\s*\n([\s\S]*?)\n```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (typeof parsed.body === 'string') {
        return parsed.body;
      }
    } catch { /* not valid JSON, fall through */ }
  }

  // Case 2: Body is raw JSON (no code fence)
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed.body === 'string') {
        return parsed.body;
      }
    } catch { /* not valid JSON, fall through */ }
  }

  // Case 3: Broken/truncated JSON — starts with ```json but JSON is malformed.
  // Extract the "body" value directly by finding its start position.
  if (trimmed.startsWith('```json')) {
    const bodyKeyIdx = raw.indexOf('"body"');
    if (bodyKeyIdx !== -1) {
      // Find the opening quote of the value: "body": "..."
      const colonIdx = raw.indexOf(':', bodyKeyIdx + 6);
      const valueQuoteIdx = raw.indexOf('"', colonIdx + 1);
      if (valueQuoteIdx !== -1) {
        const valueContent = raw.substring(valueQuoteIdx + 1);
        // Un-escape JSON string escapes (\n, \", \\, \t)
        return valueContent
          .replace(/\\n/g, '\n')
          .replace(/\\\\/g, '\\')
          .replace(/\\"/g, '"')
          .replace(/\\t/g, '\t');
      }
    }
  }

  // Case 4: Plain markdown — return as-is
  return raw;
}

function extractPreviewText(raw: string): string {
  const md = extractBodyMarkdown(raw);
  // Strip markdown syntax for plain-text preview
  return md
    .replace(/```[\s\S]*?```/g, '')  // code blocks
    .replace(/#{1,6}\s+/g, '')       // headers
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')   // italic
    .replace(/`([^`]+)`/g, '$1')     // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*]\s+/gm, '')       // list markers
    .replace(/^>\s+/gm, '')          // blockquotes
    .replace(/---+/g, '')            // hr
    .replace(/\n{2,}/g, ' ')         // collapse newlines
    .replace(/\n/g, ' ')
    .trim()
    .slice(0, 150);
}

// ── Lightweight Markdown renderer ──

function MarkdownBody({ content }: { content: string }) {
  const elements = useMemo(() => renderMarkdown(content), [content]);
  return <div className="space-y-2">{elements}</div>;
}

function renderMarkdown(md: string): ReactNode[] {
  const lines = md.split('\n');
  const elements: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <div key={key++} className="rounded-md bg-zinc-900 border border-zinc-700/50 overflow-x-auto">
          {lang && (
            <div className="px-3 py-1 text-[9px] text-zinc-500 border-b border-zinc-700/50 font-mono uppercase tracking-wider">
              {lang}
            </div>
          )}
          <pre className="p-3 text-[11px] text-emerald-300 font-mono leading-relaxed">
            {codeLines.join('\n')}
          </pre>
        </div>
      );
      continue;
    }

    // Horizontal rule
    if (/^---+\s*$/.test(line.trim())) {
      elements.push(<hr key={key++} className="border-zinc-700/40 my-1" />);
      i++;
      continue;
    }

    // Headers
    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      elements.push(
        <h4 key={key++} className="text-[11px] font-semibold text-zinc-200 mt-1">
          {renderInline(h3Match[1])}
        </h4>
      );
      i++;
      continue;
    }

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      elements.push(
        <h3 key={key++} className="text-xs font-bold text-accent-primary mt-2 mb-0.5">
          {renderInline(h2Match[1])}
        </h3>
      );
      i++;
      continue;
    }

    const h1Match = line.match(/^#\s+(.+)/);
    if (h1Match) {
      elements.push(
        <h2 key={key++} className="text-sm font-bold text-zinc-100 mt-2 mb-0.5">
          {renderInline(h1Match[1])}
        </h2>
      );
      i++;
      continue;
    }

    // Unordered list items
    if (/^\s*[-*]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      elements.push(
        <ul key={key++} className="space-y-0.5 ml-3">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-[11px] text-zinc-400 leading-relaxed flex gap-1.5">
              <span className="text-zinc-600 mt-0.5 shrink-0">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list items
    if (/^\s*\d+\.\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        listItems.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      elements.push(
        <ol key={key++} className="space-y-0.5 ml-3">
          {listItems.map((item, idx) => (
            <li key={idx} className="text-[11px] text-zinc-400 leading-relaxed flex gap-1.5">
              <span className="text-zinc-500 mt-0.5 shrink-0 font-mono text-[10px]">{idx + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      elements.push(
        <blockquote key={key++} className="border-l-2 border-accent-primary/40 pl-2.5 text-[11px] text-zinc-400 italic">
          {quoteLines.map((ql, idx) => <span key={idx}>{renderInline(ql)}{idx < quoteLines.length - 1 ? <br /> : null}</span>)}
        </blockquote>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={key++} className="text-[11px] text-zinc-400 leading-relaxed">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInline(text: string): ReactNode {
  // Process inline markdown: bold, italic, code, links
  const parts: ReactNode[] = [];
  let remaining = text;
  let partKey = 0;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      parts.push(
        <code key={partKey++} className="px-1 py-0.5 rounded bg-zinc-800 text-amber-300 text-[10px] font-mono">
          {codeMatch[1]}
        </code>
      );
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      parts.push(
        <strong key={partKey++} className="font-semibold text-zinc-200">
          {boldMatch[1]}
        </strong>
      );
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      parts.push(
        <em key={partKey++} className="italic text-zinc-300">
          {italicMatch[1]}
        </em>
      );
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Link [text](url)
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      parts.push(
        <a key={partKey++} href={linkMatch[2]} target="_blank" rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          {linkMatch[1]}
        </a>
      );
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text — consume until next special character
    const nextSpecial = remaining.search(/[`*\[]/);
    if (nextSpecial === -1) {
      parts.push(remaining);
      break;
    } else if (nextSpecial === 0) {
      // Special char that didn't match any pattern — consume it literally
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    } else {
      parts.push(remaining.slice(0, nextSpecial));
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

// ── Components ──

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
  const displayLabels = issue.labels.filter((l) => !l.name.startsWith('priority:'));
  const bodyMarkdown = useMemo(() => extractBodyMarkdown(issue.body), [issue.body]);

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
          <div className="flex items-start gap-1.5">
            <span className="text-xs text-zinc-200 font-medium leading-tight line-clamp-2 flex-1">
              #{issue.number} {issue.title}
            </span>
            <a
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 p-0.5 text-zinc-600 hover:text-zinc-300 transition shrink-0 rounded hover:bg-zinc-700/50"
              onClick={(e) => e.stopPropagation()}
              title="Open on GitHub"
            >
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
          {issue.body && !expanded && (
            <p className="text-[10px] text-zinc-500 mt-1 line-clamp-2 leading-relaxed">
              {extractPreviewText(issue.body)}
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

      {expanded && bodyMarkdown && (
        <div className="mt-2 pt-2 border-t border-zinc-700/30 max-h-80 overflow-y-auto">
          <MarkdownBody content={bodyMarkdown} />
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
              <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/30">
                <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                <span className={`text-xs font-semibold ${col.color}`}>{col.label}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{col.issues.length}</span>
              </div>
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
