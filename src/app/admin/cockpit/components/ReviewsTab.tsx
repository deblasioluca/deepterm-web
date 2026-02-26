'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, Plus, Loader2, ChevronDown, ChevronRight, ExternalLink, Upload, X } from 'lucide-react';
import type { DeliberationSummary } from '../types';
import { formatTimeAgo } from '../utils';
import DeliberationPanel from './DeliberationPanel';

const STATUS_STYLES: Record<string, string> = {
  proposing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  debating: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  voting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  decided: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  implementing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const SCOPES = [
  { key: 'full', label: 'Full Architecture', instructions: 'Review the entire DeepTerm web application architecture. Focus on: authentication boundaries, database patterns, API design, frontend architecture, and security posture.' },
  { key: 'auth', label: 'Auth System', instructions: 'Review the three authentication systems: NextAuth (web), ZK JWT (app/vault), Admin Session (intranet). Check for boundary violations, token handling, and session management.' },
  { key: 'database', label: 'Database Layer', instructions: 'Review the Prisma/SQLite database layer. Check for: N+1 queries, missing indexes, cascade behaviors, data consistency, and migration strategy.' },
  { key: 'api', label: 'API Surface', instructions: 'Review all API routes under /api/. Check for: consistent error handling, input validation, rate limiting, proper auth checks, and response formats.' },
  { key: 'frontend', label: 'Frontend', instructions: 'Review the Next.js frontend architecture. Check for: component structure, state management, performance (bundle size, re-renders), accessibility, and i18n.' },
  { key: 'custom', label: 'Custom Scope', instructions: '' },
];

interface ReviewsTabProps {
  onDataChange: () => void;
}

export default function ReviewsTab({ onDataChange }: ReviewsTabProps) {
  const [reviews, setReviews] = useState<DeliberationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [scope, setScope] = useState('full');
  const [customInstructions, setCustomInstructions] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{ name: string; content: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/deliberation?type=architecture_review');
      if (res.ok) {
        setReviews(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchReviews();
    const interval = setInterval(fetchReviews, 15000);
    return () => clearInterval(interval);
  }, [fetchReviews]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedFile({ name: file.name, content: reader.result as string });
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const startReview = async () => {
    if (!title.trim()) return;
    setCreating(true);

    const selectedScope = SCOPES.find(s => s.key === scope);
    let instructions = scope === 'custom'
      ? customInstructions
      : selectedScope?.instructions || '';

    if (uploadedFile) {
      instructions += `\n\n## Uploaded File: ${uploadedFile.name}\n\n${uploadedFile.content}`;
    }

    try {
      const res = await fetch('/api/admin/cockpit/deliberation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'architecture_review',
          title: title.trim(),
          instructions,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setShowNewForm(false);
        setTitle('');
        setScope('full');
        setCustomInstructions('');
        setUploadedFile(null);
        setExpandedId(data.id);

        // Auto-run the review
        await fetch(`/api/admin/cockpit/deliberation/${data.id}/auto`, { method: 'POST' });

        fetchReviews();
      }
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  // Count active reviews
  const activeCount = reviews.filter(r => !['decided', 'failed'].includes(r.status)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-white">Architecture Reviews</h2>
          {activeCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {activeCount} active
            </span>
          )}
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:bg-purple-500/30 transition"
        >
          <Plus className="w-3 h-3" />
          New Review
        </button>
      </div>

      {/* New Review Form */}
      {showNewForm && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-white">Start Architecture Review</h3>

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Q1 2026 Security Audit"
              className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Scope</label>
            <div className="grid grid-cols-3 gap-2">
              {SCOPES.map(s => (
                <button
                  key={s.key}
                  onClick={() => setScope(s.key)}
                  className={`px-2 py-1.5 rounded-lg text-xs border transition ${
                    scope === s.key
                      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                      : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {scope === 'custom' && (
            <div>
              <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Custom Instructions</label>
              <textarea
                value={customInstructions}
                onChange={e => setCustomInstructions(e.target.value)}
                rows={3}
                placeholder="Describe what to review..."
                className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 resize-none"
              />
            </div>
          )}

          {/* File upload */}
          <div>
            <label className="block text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Attach File (optional)</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.json,.yaml,.yml"
              onChange={handleFileUpload}
              className="hidden"
            />
            {uploadedFile ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg">
                <Upload className="w-3 h-3 text-purple-400" />
                <span className="text-xs text-purple-400 flex-1 truncate">{uploadedFile.name}</span>
                <span className="text-[10px] text-zinc-500">{(uploadedFile.content.length / 1024).toFixed(1)}KB</span>
                <button
                  onClick={() => setUploadedFile(null)}
                  className="p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg text-xs text-zinc-400 hover:text-zinc-300 hover:border-zinc-600 transition w-full"
              >
                <Upload className="w-3 h-3" />
                Upload .md, .txt, .json, or .yaml
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={startReview}
              disabled={!title.trim() || creating}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Search className="w-3 h-3" />}
              {creating ? 'Starting...' : 'Start Review'}
            </button>
            <button
              onClick={() => setShowNewForm(false)}
              className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition"
            >
              Cancel
            </button>
          </div>

          <p className="text-[10px] text-zinc-500">
            Three AI agents (Architect, Security, Performance) will independently review, debate, and vote on findings.
          </p>
        </div>
      )}

      {/* Reviews List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 text-zinc-500 text-xs">
          No architecture reviews yet. Start one to have AI agents review your codebase.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map(review => (
            <div key={review.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === review.id ? null : review.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800/50 transition"
              >
                {expandedId === review.id
                  ? <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                  : <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white truncate">{review.title || 'Untitled Review'}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${STATUS_STYLES[review.status] || ''}`}>
                      {review.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[10px] text-zinc-500">
                    <span>{formatTimeAgo(review.createdAt)}</span>
                    {review._count && (
                      <>
                        <span>{review._count.proposals} proposals</span>
                        <span>{review._count.debates} debate entries</span>
                        <span>{review._count.votes} votes</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              {expandedId === review.id && (
                <div className="px-4 pb-4">
                  <DeliberationPanel
                    deliberationId={review.id}
                    onClose={() => setExpandedId(null)}
                    onComplete={() => {
                      fetchReviews();
                      onDataChange();
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
