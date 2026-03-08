'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitPullRequest, GitMerge, Loader2, ChevronDown, ChevronRight,
  ExternalLink, Check, X, MessageSquare, FileCode, Plus, Minus,
  RefreshCw, XCircle, Filter,
} from 'lucide-react';

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: string;
  draft: boolean;
  repo: string;
  user: string;
  branch: string;
  baseBranch: string;
  labels: Array<{ name: string; color: string }>;
  mergeable: boolean;
  additions: number;
  deletions: number;
  changedFiles: number;
  createdAt: string;
  updatedAt: string;
  url: string;
}

interface PRFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch: string;
}

interface PRReview {
  id: number;
  user: string;
  state: string;
  body: string;
  submittedAt: string;
}

function encodeRepo(repo: string): string {
  return repo.replace('/', '--');
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

const FILE_STATUS_STYLES: Record<string, string> = {
  added: 'text-emerald-400',
  modified: 'text-amber-400',
  removed: 'text-red-400',
  renamed: 'text-blue-400',
};

const REVIEW_STYLES: Record<string, string> = {
  APPROVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CHANGES_REQUESTED: 'bg-red-500/20 text-red-400 border-red-500/30',
  COMMENTED: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PENDING: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

interface Props {
  repo: string;
  autoRefresh: boolean;
  refreshKey: number;
}

export default function PullRequestsFullTab({ repo, autoRefresh, refreshKey }: Props) {
  const [pulls, setPulls] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [stateFilter, setStateFilter] = useState<'open' | 'closed' | 'all'>('open');
  const [expandedPR, setExpandedPR] = useState<string | null>(null); // "repo:number"
  const [prDetail, setPrDetail] = useState<{ files: PRFile[]; reviews: PRReview[] } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewBody, setReviewBody] = useState('');
  const [mergeMethod, setMergeMethod] = useState<'squash' | 'merge' | 'rebase'>('squash');

  const fetchPulls = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ state: stateFilter });
      if (repo) params.set('repo', repo);
      const res = await fetch(`/api/admin/cockpit/github/pulls?${params}`);
      if (res.ok) {
        const data = await res.json();
        setPulls(data.pulls || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [repo, stateFilter]);

  useEffect(() => { fetchPulls(); }, [fetchPulls, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchPulls, 60000);
    return () => clearInterval(interval);
  }, [fetchPulls, autoRefresh]);

  const prKey = (pr: PullRequest) => `${pr.repo}:${pr.number}`;

  const loadPRDetail = async (pr: PullRequest) => {
    const key = prKey(pr);
    if (expandedPR === key) {
      setExpandedPR(null); setPrDetail(null); setShowReviewForm(false);
      return;
    }
    setExpandedPR(key);
    setDetailLoading(true);
    setShowReviewForm(false);
    setExpandedFiles(new Set());
    try {
      const encoded = encodeRepo(pr.repo);
      const res = await fetch(`/api/admin/cockpit/pulls/${encoded}/${pr.number}`);
      if (res.ok) setPrDetail(await res.json());
    } catch { /* silent */ } finally {
      setDetailLoading(false);
    }
  };

  const handleMerge = async (pr: PullRequest) => {
    if (!confirm(`Merge PR #${pr.number} "${pr.title}" via ${mergeMethod}?`)) return;
    setActionLoading('merge');
    try {
      const encoded = encodeRepo(pr.repo);
      const res = await fetch(`/api/admin/cockpit/pulls/${encoded}/${pr.number}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: mergeMethod }),
      });
      const data = await res.json();
      if (res.ok && data.merged) {
        setActionResult({ msg: `PR #${pr.number} merged`, ok: true });
        fetchPulls();
      } else {
        setActionResult({ msg: data.message || data.error || 'Merge failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  const handleClose = async (pr: PullRequest) => {
    if (!confirm(`Close PR #${pr.number} "${pr.title}" without merging?`)) return;
    setActionLoading('close');
    try {
      const res = await fetch('/api/admin/cockpit/github/pulls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'close', repo: pr.repo, number: pr.number }),
      });
      const data = await res.json();
      if (data.closed) {
        setActionResult({ msg: `PR #${pr.number} closed`, ok: true });
        fetchPulls();
      } else {
        setActionResult({ msg: data.message || 'Close failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  const handleReview = async (pr: PullRequest, event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') => {
    if (event === 'REQUEST_CHANGES' && !reviewBody.trim()) {
      setActionResult({ msg: 'Please provide feedback', ok: false });
      return;
    }
    setActionLoading(event);
    try {
      const encoded = encodeRepo(pr.repo);
      const res = await fetch(`/api/admin/cockpit/pulls/${encoded}/${pr.number}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, body: reviewBody }),
      });
      if (res.ok) {
        const label = event === 'APPROVE' ? 'Approved' : event === 'REQUEST_CHANGES' ? 'Changes requested' : 'Comment submitted';
        setActionResult({ msg: `${label} on PR #${pr.number}`, ok: true });
        setReviewBody(''); setShowReviewForm(false);
        const detailRes = await fetch(`/api/admin/cockpit/pulls/${encoded}/${pr.number}`);
        if (detailRes.ok) setPrDetail(await detailRes.json());
      } else {
        const err = await res.json();
        setActionResult({ msg: err.error || 'Review failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  const toggleFile = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };

  useEffect(() => {
    if (actionResult) {
      const t = setTimeout(() => setActionResult(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionResult]);

  const activePR = pulls.find(p => prKey(p) === expandedPR);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitPullRequest className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-white">Pull Requests</h2>
          <span className="text-xs text-zinc-500">({pulls.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-0.5 border border-zinc-700">
            {(['open', 'closed', 'all'] as const).map(s => (
              <button key={s} onClick={() => setStateFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
                  stateFilter === s ? 'bg-zinc-600 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button onClick={fetchPulls} className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionResult && (
        <div className={`px-3 py-2 rounded-lg text-sm ${actionResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {actionResult.msg}
        </div>
      )}

      {loading && pulls.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : pulls.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <GitPullRequest className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No pull requests found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pulls.map(pr => (
            <div key={pr.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <button
                onClick={() => loadPRDetail(pr)}
                className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition text-left"
              >
                {expandedPR === prKey(pr) ? <ChevronDown className="w-4 h-4 text-zinc-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />}
                <GitPullRequest className={`w-4 h-4 flex-shrink-0 ${pr.state === 'closed' ? 'text-red-400' : pr.draft ? 'text-zinc-500' : 'text-emerald-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-white font-medium truncate">{pr.title}</span>
                    {pr.draft && <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">Draft</span>}
                    {pr.state === 'closed' && <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">Closed</span>}
                    {pr.labels.map(l => (
                      <span key={l.name} className="text-xs px-1.5 py-0.5 rounded border border-zinc-700" style={{ color: `#${l.color}` }}>{l.name}</span>
                    ))}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    #{pr.number} · {pr.repo.split('/')[1]} · {pr.branch} → {pr.baseBranch} · {pr.user} · {timeAgo(pr.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-shrink-0">
                  <span className="text-emerald-400">+{pr.additions}</span>
                  <span className="text-red-400">-{pr.deletions}</span>
                  <span>{pr.changedFiles} files</span>
                </div>
              </button>

              {expandedPR === prKey(pr) && (
                <div className="border-t border-zinc-800 bg-zinc-950 p-4 space-y-4">
                  {detailLoading ? (
                    <div className="flex items-center justify-center py-8 text-zinc-500">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading diff…
                    </div>
                  ) : prDetail ? (
                    <>
                      {/* Action bar */}
                      {pr.state === 'open' && (
                        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-zinc-800">
                          <div className="flex items-center gap-1.5">
                            <select value={mergeMethod} onChange={e => setMergeMethod(e.target.value as 'squash' | 'merge' | 'rebase')}
                              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1.5 text-xs text-zinc-300">
                              <option value="squash">Squash</option>
                              <option value="merge">Merge</option>
                              <option value="rebase">Rebase</option>
                            </select>
                            <button onClick={() => handleMerge(pr)} disabled={!!actionLoading || !pr.mergeable}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition">
                              {actionLoading === 'merge' ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />} Merge
                            </button>
                          </div>
                          <div className="w-px h-5 bg-zinc-700" />
                          <button onClick={() => handleReview(pr, 'APPROVE')} disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-medium border border-emerald-500/30 disabled:opacity-50 transition">
                            {actionLoading === 'APPROVE' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Approve
                          </button>
                          <button onClick={() => setShowReviewForm(!showReviewForm)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/30 transition">
                            <MessageSquare className="w-3 h-3" /> {showReviewForm ? 'Cancel' : 'Request Changes'}
                          </button>
                          <button onClick={() => handleClose(pr)} disabled={!!actionLoading}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium border border-zinc-700 disabled:opacity-50 transition">
                            <XCircle className="w-3 h-3" /> Close
                          </button>
                          <div className="flex-1" />
                          <a href={pr.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition">
                            <ExternalLink className="w-3 h-3" /> GitHub
                          </a>
                        </div>
                      )}

                      {/* Review form */}
                      {showReviewForm && (
                        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 space-y-2">
                          <textarea value={reviewBody} onChange={e => setReviewBody(e.target.value)}
                            placeholder="Describe the changes you'd like to see…" rows={3}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-500" />
                          <div className="flex items-center gap-2">
                            <button onClick={() => activePR && handleReview(activePR, 'REQUEST_CHANGES')} disabled={!!actionLoading}
                              className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-500 text-white text-xs font-medium disabled:opacity-50 transition">
                              {actionLoading === 'REQUEST_CHANGES' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />} Submit
                            </button>
                            <button onClick={() => activePR && handleReview(activePR, 'COMMENT')} disabled={!!actionLoading}
                              className="px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs font-medium disabled:opacity-50 transition">
                              Comment Only
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Reviews */}
                      {prDetail.reviews.length > 0 && (
                        <div>
                          <h3 className="text-xs font-medium text-zinc-400 mb-2">Reviews</h3>
                          <div className="space-y-1.5">
                            {prDetail.reviews.map(r => (
                              <div key={r.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border text-xs ${REVIEW_STYLES[r.state] || REVIEW_STYLES.PENDING}`}>
                                <span className="font-medium">{r.user}</span>
                                <span className="opacity-75">{r.state.replace('_', ' ')}</span>
                                {r.body && <span className="text-zinc-400 truncate ml-1">— {r.body}</span>}
                                <span className="ml-auto text-zinc-500">{timeAgo(r.submittedAt)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Files */}
                      <div>
                        <h3 className="text-xs font-medium text-zinc-400 mb-2">Files changed ({prDetail.files.length})</h3>
                        <div className="space-y-1">
                          {prDetail.files.map(f => (
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
                      </div>
                    </>
                  ) : (
                    <p className="text-zinc-500 text-sm text-center py-4">Failed to load PR details</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
