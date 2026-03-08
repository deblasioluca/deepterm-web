'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  GitBranch, Loader2, RefreshCw, Trash2, GitMerge, ExternalLink,
  Shield, ChevronDown, ChevronRight, ArrowRight, FileCode, GitCommit,
} from 'lucide-react';

interface Branch {
  name: string;
  sha: string;
  repo: string;
  protected: boolean;
}

interface CompareResult {
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  commits: Array<{ sha: string; message: string; author: string; date: string }>;
  files: Array<{ filename: string; status: string; additions: number; deletions: number }>;
}

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

interface Props {
  repo: string;
  autoRefresh: boolean;
  refreshKey: number;
}

export default function BranchesTab({ repo, autoRefresh, refreshKey }: Props) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  // Compare state
  const [compareOpen, setCompareOpen] = useState<string | null>(null); // "repo:branch"
  const [compareBase, setCompareBase] = useState('main');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);

  // Merge state
  const [mergeOpen, setMergeOpen] = useState<string | null>(null); // "repo:branch"
  const [mergeBase, setMergeBase] = useState('main');

  const fetchBranches = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (repo) params.set('repo', repo);
      const res = await fetch(`/api/admin/cockpit/github/branches?${params}`);
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => { fetchBranches(); }, [fetchBranches, refreshKey]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchBranches, 60000);
    return () => clearInterval(interval);
  }, [fetchBranches, autoRefresh]);

  const branchKey = (b: Branch) => `${b.repo}:${b.name}`;

  const handleDelete = async (branch: Branch) => {
    if (!confirm(`Delete branch "${branch.name}" from ${branch.repo.split('/')[1]}? This cannot be undone.`)) return;
    setActionLoading(`delete-${branchKey(branch)}`);
    try {
      const res = await fetch('/api/admin/cockpit/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', repo: branch.repo, branch: branch.name }),
      });
      const data = await res.json();
      if (data.deleted) {
        setActionResult({ msg: `Branch "${branch.name}" deleted`, ok: true });
        fetchBranches();
      } else {
        setActionResult({ msg: data.message || 'Delete failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  const handleCompare = async (branch: Branch) => {
    const key = branchKey(branch);
    if (compareOpen === key && compareResult) {
      setCompareOpen(null); setCompareResult(null);
      return;
    }
    setCompareOpen(key);
    setCompareLoading(true);
    setCompareResult(null);
    try {
      const res = await fetch('/api/admin/cockpit/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'compare', repo: branch.repo, base: compareBase, head: branch.name }),
      });
      if (res.ok) setCompareResult(await res.json());
      else {
        const err = await res.json().catch(() => ({}));
        setActionResult({ msg: err.error || 'Compare failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setCompareLoading(false); }
  };

  const handleMerge = async (branch: Branch) => {
    if (!confirm(`Merge "${branch.name}" into "${mergeBase}" in ${branch.repo.split('/')[1]}?`)) return;
    setActionLoading(`merge-${branchKey(branch)}`);
    try {
      const res = await fetch('/api/admin/cockpit/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'merge',
          repo: branch.repo,
          base: mergeBase,
          head: branch.name,
          commitMessage: `Merge ${branch.name} into ${mergeBase}`,
        }),
      });
      const data = await res.json();
      if (data.merged) {
        setActionResult({ msg: data.message || `Merged "${branch.name}" into "${mergeBase}"`, ok: true });
        setMergeOpen(null);
        fetchBranches();
      } else {
        setActionResult({ msg: data.message || 'Merge failed', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally { setActionLoading(null); }
  };

  useEffect(() => {
    if (actionResult) {
      const t = setTimeout(() => setActionResult(null), 5000);
      return () => clearTimeout(t);
    }
  }, [actionResult]);

  const filtered = search
    ? branches.filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    : branches;

  // Group by repo
  const grouped = filtered.reduce<Record<string, Branch[]>>((acc, b) => {
    if (!acc[b.repo]) acc[b.repo] = [];
    acc[b.repo].push(b);
    return acc;
  }, {});

  const availableBases = (currentRepo: string) =>
    branches.filter(b => b.repo === currentRepo).map(b => b.name);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-orange-400" />
          <h2 className="text-lg font-semibold text-white">Branches</h2>
          <span className="text-xs text-zinc-500">({filtered.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search branches…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-500 w-48 focus:outline-none focus:border-zinc-600"
          />
          <button onClick={fetchBranches} className="p-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {actionResult && (
        <div className={`px-3 py-2 rounded-lg text-sm ${actionResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {actionResult.msg}
        </div>
      )}

      {loading && branches.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading branches…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No branches found</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([repoName, repoBranches]) => (
            <div key={repoName}>
              <div className="text-xs font-medium text-zinc-400 mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> {repoName.split('/')[1]}
                <span className="text-zinc-600">({repoBranches.length})</span>
              </div>
              <div className="space-y-1">
                {repoBranches.sort((a, b) => {
                  if (a.name === 'main') return -1;
                  if (b.name === 'main') return 1;
                  return a.name.localeCompare(b.name);
                }).map(branch => {
                  const key = branchKey(branch);
                  const isDefault = branch.name === 'main';
                  return (
                    <div key={key} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                      <div className="px-4 py-2.5 flex items-center gap-3">
                        <GitBranch className={`w-4 h-4 flex-shrink-0 ${isDefault ? 'text-emerald-400' : 'text-zinc-500'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-zinc-200 font-medium">{branch.name}</span>
                            {isDefault && <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">default</span>}
                            {branch.protected && <span title="Protected"><Shield className="w-3 h-3 text-amber-400" /></span>}
                          </div>
                          <div className="text-xs text-zinc-600 mt-0.5 font-mono">{shortSha(branch.sha)}</div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {/* Compare */}
                          <button
                            onClick={() => {
                              if (compareOpen === key) { setCompareOpen(null); setCompareResult(null); }
                              else { setCompareBase('main'); handleCompare(branch); }
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 transition"
                            title="Compare with base"
                          >
                            <ArrowRight className="w-3 h-3" /> Compare
                          </button>
                          {/* Merge */}
                          {!isDefault && (
                            <button
                              onClick={() => setMergeOpen(mergeOpen === key ? null : key)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 transition"
                              title="Merge into another branch"
                            >
                              <GitMerge className="w-3 h-3" /> Merge
                            </button>
                          )}
                          {/* Delete */}
                          {!isDefault && !branch.protected && (
                            <button
                              onClick={() => handleDelete(branch)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 disabled:opacity-50 transition"
                              title="Delete branch"
                            >
                              {actionLoading === `delete-${key}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </button>
                          )}
                          {/* GitHub link */}
                          <a
                            href={`https://github.com/${branch.repo}/tree/${encodeURIComponent(branch.name)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-zinc-500 hover:text-zinc-300 transition p-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>

                      {/* Merge panel */}
                      {mergeOpen === key && (
                        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400">Merge</span>
                            <span className="text-xs text-zinc-200 font-medium">{branch.name}</span>
                            <ArrowRight className="w-3 h-3 text-zinc-500" />
                            <select
                              value={mergeBase}
                              onChange={e => setMergeBase(e.target.value)}
                              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300"
                            >
                              {availableBases(branch.repo)
                                .filter(n => n !== branch.name)
                                .map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <button
                              onClick={() => handleMerge(branch)}
                              disabled={!!actionLoading}
                              className="flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium disabled:opacity-50 transition"
                            >
                              {actionLoading === `merge-${key}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
                              Merge
                            </button>
                            <button onClick={() => setMergeOpen(null)} className="text-xs text-zinc-500 hover:text-zinc-300 ml-1">Cancel</button>
                          </div>
                        </div>
                      )}

                      {/* Compare panel */}
                      {compareOpen === key && (
                        <div className="border-t border-zinc-800 bg-zinc-950 px-4 py-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-zinc-400">Comparing</span>
                            <select
                              value={compareBase}
                              onChange={e => { setCompareBase(e.target.value); }}
                              className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300"
                            >
                              {availableBases(branch.repo)
                                .filter(n => n !== branch.name)
                                .map(n => <option key={n} value={n}>{n}</option>)}
                            </select>
                            <ArrowRight className="w-3 h-3 text-zinc-500" />
                            <span className="text-xs text-zinc-200 font-medium">{branch.name}</span>
                            <button
                              onClick={() => handleCompare(branch)}
                              className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 border border-zinc-700 transition"
                            >
                              <RefreshCw className={`w-3 h-3 ${compareLoading ? 'animate-spin' : ''}`} /> Update
                            </button>
                          </div>

                          {compareLoading ? (
                            <div className="flex items-center justify-center py-4 text-zinc-500">
                              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Comparing…
                            </div>
                          ) : compareResult ? (
                            <div className="space-y-3">
                              {/* Stats */}
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-emerald-400">{compareResult.aheadBy} ahead</span>
                                <span className="text-red-400">{compareResult.behindBy} behind</span>
                                <span className="text-zinc-500">{compareResult.totalCommits} commits</span>
                                <span className="text-zinc-500">{compareResult.files.length} files changed</span>
                              </div>

                              {/* Commits list */}
                              {compareResult.commits.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-zinc-400 mb-1">Commits</h4>
                                  <div className="space-y-0.5 max-h-48 overflow-y-auto">
                                    {compareResult.commits.map(c => (
                                      <div key={c.sha} className="flex items-center gap-2 py-1 px-2 bg-zinc-900 rounded text-xs">
                                        <GitCommit className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                        <span className="font-mono text-zinc-500">{c.sha.slice(0, 7)}</span>
                                        <span className="text-zinc-300 truncate flex-1">{c.message.split('\n')[0]}</span>
                                        <span className="text-zinc-600 flex-shrink-0">{c.author}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Files */}
                              {compareResult.files.length > 0 && (
                                <div>
                                  <h4 className="text-xs font-medium text-zinc-400 mb-1">Files</h4>
                                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                    {compareResult.files.map(f => (
                                      <div key={f.filename} className="flex items-center gap-2 py-1 px-2 bg-zinc-900 rounded text-xs">
                                        <FileCode className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                        <span className="text-zinc-300 truncate flex-1">{f.filename}</span>
                                        <span className="text-emerald-400">+{f.additions}</span>
                                        <span className="text-red-400">-{f.deletions}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {compareResult.totalCommits === 0 && (
                                <p className="text-xs text-zinc-500">Branches are identical — nothing to compare.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
