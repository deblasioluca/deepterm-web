'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import {
  ArrowLeft,
  ThumbsUp,
  MessageSquare,
  Loader2,
  Send,
  Eye,
  EyeOff,
  GitPullRequest,
} from 'lucide-react';

type IdeaCommentType = {
  id: string;
  authorType: string;
  authorName: string | null;
  authorEmail: string | null;
  message: string;
  visibility: string;
  createdAt: string;
};

type IdeaDetailType = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  githubIssueNumber: number | null;
  authorName: string;
  authorEmail: string;
  voteCount: number;
  createdAt: string;
  comments: IdeaCommentType[];
};

const statusOptions = [
  { value: 'consideration', label: 'Under Consideration', color: 'text-yellow-500' },
  { value: 'planned', label: 'Planned', color: 'text-purple-500' },
  { value: 'in-progress', label: 'In Progress', color: 'text-orange-500' },
  { value: 'beta', label: 'Beta', color: 'text-blue-500' },
  { value: 'launched', label: 'Launched', color: 'text-accent-secondary' },
  { value: 'declined', label: 'Declined', color: 'text-red-500' },
];

export default function AdminFeedbackDetailPage({ params }: { params: { id: string } }) {
  const [idea, setIdea] = useState<IdeaDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('public');
  const [isPosting, setIsPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/admin/feedback/${encodeURIComponent(params.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load idea');
      setIdea(data.idea);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load idea');
    } finally {
      setIsLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const postReply = async () => {
    const msg = reply.trim();
    if (!msg || isPosting) return;
    try {
      setIsPosting(true);
      const res = await fetch(`/api/admin/feedback/${encodeURIComponent(params.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, visibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post reply');
      setReply('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post reply');
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  if (error || !idea) {
    return (
      <Card>
        <p className="text-sm text-red-500">{error || 'Idea not found.'}</p>
        <div className="mt-4">
          <a href="/admin/feedback"><Button variant="secondary">Back to feedback</Button></a>
        </div>
      </Card>
    );
  }

  const statusOpt = statusOptions.find((s) => s.value === idea.status);

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Back link */}
        <a href="/admin/feedback" className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline mb-6">
          <ArrowLeft className="w-4 h-4" /> Back to feedback
        </a>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{idea.title}</h1>
            <div className="flex items-center gap-3 mt-2 text-sm">
              <span className={statusOpt?.color || 'text-text-secondary'}>{statusOpt?.label || idea.status}</span>
              <span className="text-text-tertiary">•</span>
              <span className="text-text-tertiary">by {idea.authorName || idea.authorEmail}</span>
              <span className="text-text-tertiary">•</span>
              <span className="text-text-tertiary">{new Date(idea.createdAt).toLocaleDateString()}</span>
              <div className="flex items-center gap-1 text-accent-primary">
                <ThumbsUp className="w-4 h-4" />
                <span className="font-medium">{idea.voteCount}</span>
              </div>
              {idea.githubIssueNumber && (
                <a
                  href={`https://github.com/deblasioluca/deepterm/issues/${idea.githubIssueNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs font-medium hover:bg-green-500/20"
                >
                  <GitPullRequest className="w-3 h-3" /> #{idea.githubIssueNumber}
                </a>
              )}
            </div>
          </div>
          <Badge variant="secondary" className="text-xs">{idea.category}</Badge>
        </div>

        {/* Description */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-3">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{idea.description}</p>
          <p className="text-xs text-text-tertiary mt-4">
            Submitted by: {idea.authorName} ({idea.authorEmail})
          </p>
        </Card>

        {/* Conversation Timeline */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-3">
            <MessageSquare className="w-5 h-5 inline mr-2" />
            Conversation ({idea.comments.length})
          </h2>

          {idea.comments.length === 0 ? (
            <p className="text-sm text-text-secondary">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {idea.comments.map((c) => (
                <div
                  key={c.id}
                  className={`p-4 rounded-lg border ${
                    c.visibility === 'internal'
                      ? 'bg-amber-500/5 border-amber-500/20'
                      : c.authorType === 'admin'
                      ? 'bg-accent-primary/5 border-accent-primary/20'
                      : c.authorType === 'ai'
                      ? 'bg-blue-500/5 border-blue-500/20'
                      : 'bg-background-tertiary border-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-text-primary">
                      {c.authorName || c.authorEmail || 'Unknown'}
                    </span>
                    {c.authorType === 'admin' && <Badge variant="primary" className="text-[10px] px-1.5 py-0">Admin</Badge>}
                    {c.authorType === 'ai' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">AI</Badge>}
                    {c.authorType === 'user' && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">User</Badge>}
                    {c.visibility === 'internal' && (
                      <Badge variant="warning" className="text-[10px] px-1.5 py-0">INTERNAL</Badge>
                    )}
                    <span className="text-xs text-text-tertiary">{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">{c.message}</p>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Reply form */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-3">Post Reply</h2>

          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setVisibility('public')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                visibility === 'public'
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-background-tertiary text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Public Reply
            </button>
            <button
              onClick={() => setVisibility('internal')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                visibility === 'internal'
                  ? 'bg-amber-500/20 text-amber-400'
                  : 'bg-background-tertiary text-text-tertiary hover:text-text-secondary'
              }`}
            >
              <EyeOff className="w-3.5 h-3.5" /> Internal Note
            </button>
          </div>

          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={4}
            className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            placeholder={visibility === 'public' ? 'Reply to the user (they will be notified by email)…' : 'Internal note (only visible to admins)…'}
          />

          <div className="flex items-center justify-between mt-3">
            {visibility === 'public' && (
              <p className="text-xs text-text-tertiary">
                The user will receive an email notification for this reply.
              </p>
            )}
            {visibility === 'internal' && (
              <p className="text-xs text-amber-400">
                This note is only visible to admins.
              </p>
            )}
            <Button
              variant="primary"
              onClick={postReply}
              disabled={isPosting || !reply.trim()}
            >
              <Send className="w-4 h-4 mr-2" />
              {isPosting ? 'Posting…' : visibility === 'public' ? 'Send Reply' : 'Save Note'}
            </Button>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}
