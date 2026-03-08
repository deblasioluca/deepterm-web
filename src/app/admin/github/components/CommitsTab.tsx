'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitCommit, Loader2, ChevronDown, ChevronRight, ExternalLink,
  RefreshCw, FileCode, Plus, Minus, Copy, Check,
} from 'lucide-react';

interface Commit {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorAvatar: string;
  date: string;
  repo: string;
  url: string;
}

interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
  files: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string;
  }>;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const seconds = Math.floor((now - d) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

const FILE_STATUS_STYLES: Record<string, string> = {
  added: 'text-emerald-400',
  modified: 'text-amber-400',
  removed: 'text-red-400',
  renamed: 'text-blue-400',
};

interface Props {
  repo: string;
  autoRefresh: boolean;
  refreshKey: number;
}

export default function CommitsTab({ repo, autoRefresh, refreshKey }: Props) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');
  const [expandedSha, setExpandedSha] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [copiedSha, setCopiedSha] = useState<string | null>(null);

  const fetchCommits = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repo) params.set('repo', repo);
      if (branchFilter) params.set('branch', branchFilter);
      params.set('perPage', '40');
      const res = await fetch(`/api/admin/cockpit/github/commits?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCommits(data.commits || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [repo, branchFilter]);

  useEffect(() => { fetchCommits(); }, [fetchCommits, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchCommits, 60000);
    return () => clearInterval(interval);
  }, [fetchCommits, autoRefresh]);

  const loadDetail = async (commit: Commit) => {
    if (expandedSha === commit.sha) {
      setExpandedSha(null); setDetail(null);
      return;
    }
    setExpandedSha(commit.sha);
    setDetailLoading(true);
    setExpandedFiles(new Set());
    try {
      const res = await fetch('/api/admin/cockpit/github/commits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: commit.repo, sha: commit.sha }),
      });
      if (res.ok) setDetail(await res.json());
    } catch { /* silent */ } finally {
      setDetailLoading(false);
    }
  };

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };

  const copySha = (sha: string) => {
    navigator.clipboard.writeText(sha);
    setCopiedSha(sha);
    setTimeout(() => setCopiedSha(null), 2000);
  };

  // Group commits by date
  const grouped = commits.reduce<Record<string, Commit[]>>((acc, c) => {
    const day = formatDate(c.date);
    if (!acc[day]) acc[day] = [];
    acc[day].push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitCommit className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Commits</h2>
          <span className="text-xs text-zinc-500">({commits.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Filter by branch…"
            value={branchFilter}
            onChange={e => setBranchFilter(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-500 w-40 focus:outline-none focus:border-zinc-600"
          />
          <button onClick={fetchCommits} className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && commits.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading commits…
        </div>
      ) : commits.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No commits found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([day, dayCommits]) => (
            <div key={day}>
              <div className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wide">{day}</div>
              <div className="space-y-1">
                {dayCommits.map(commit => (
                  <div key={commit.sha} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => loadDetail(commit)}
                      className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-zinc-800/50 transition text-left"
                    >
                      {expandedSha === commit.sha ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-zinc-200 truncate">{commit.message.split('\n')[0]}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          {commit.author} · {commit.repo.split('/')[1]} · {timeAgo(commit.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); copySha(commit.sha); }}
                          className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-400 hover:text-zinc-200 transition"
                          title="Copy SHA"
                        >
                          {copiedSha === commit.sha ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          {commit.shortSha}
                        </button>
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-zinc-500 hover:text-zinc-300 transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </button>

                    {expandedSha === commit.sha && (
                      <div className="border-t border-zinc-800 bg-zinc-950 p-4 space-y-3">
                        {detailLoading ? (
                          <div className="flex items-center justify-center py-6 text-zinc-500">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading diff…
                          </div>
                        ) : detail ? (
                          <>
                            {/* Full commit message */}
                            {detail.message.includes('\n') && (
                              <pre className="text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-md p-3 whitespace-pre-wrap">{detail.message}</pre>
                            )}

                            {/* Stats */}
                            <div className="flex items-center gap-4 text-xs text-zinc-500">
                              <span className="text-emerald-400">+{detail.additions}</span>
                              <span className="text-red-400">-{detail.deletions}</span>
                              <span>{detail.files.length} files</span>
                            </div>

                            {/* Files */}
                            <div className="space-y-1">
                              {detail.files.map(f => (
                                <div key={f.filename} className="bg-zinc-900 border border-zinc-800 rounded-md overflow-hidden">
                                  <button onClick={() => toggleFile(f.filename)}
                                    className="w-full px-3 py-2 flex items-center gap-2 hover:bg-zinc-800/50 transition text-left">
                                    {expandedFiles.has(f.filename) ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                                    <FileCode className={`w-3.5 h-3.5 ${FILE_STATUS_STYLES[f.status] || 'text-zinc-400'}`} />
                                    <span className="text-xs text-zinc-300 truncate flex-1">{f.filename}</span>
                                    <span className="text-xs text-emerald-400">+{f.additions}</span>
                                    <span className="text-xs text-red-400">-{f.deletions}</span>
                                  </button>
                                  {expandedFiles.has(f.filename) && f.patch && (
                                    <pre className="px-3 py-2 text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 bg-zinc-950 border-t border-zinc-800 text-zinc-400">{f.patch}</pre>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-zinc-500 text-sm text-center py-4">Failed to load commit details</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
