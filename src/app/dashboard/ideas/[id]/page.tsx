'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ChevronUp, MessageSquare, ArrowLeft } from 'lucide-react';

type IdeaComment = {
  id: string;
  authorType: string;
  authorName: string | null;
  message: string;
  createdAt: string;
};

type IdeaDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  votes: number;
  hasVoted: boolean;
  author: string;
  authorId: string;
  githubIssueNumber: number | null;
  createdAt: string;
  comments: IdeaComment[];
};

const statusLabels: Record<string, string> = {
  consideration: 'Under Consideration',
  planned: 'Planned',
  'in-progress': 'In Progress',
  beta: 'In Beta',
  launched: 'Launched',
  declined: 'Declined',
};

const statusColors: Record<string, string> = {
  consideration: 'text-yellow-500',
  planned: 'text-purple-500',
  'in-progress': 'text-orange-500',
  beta: 'text-blue-500',
  launched: 'text-accent-secondary',
  declined: 'text-red-500',
};

export default function IdeaDetailPage({ params }: { params: { id: string } }) {
  const [idea, setIdea] = useState<IdeaDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/ideas/${encodeURIComponent(params.id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load idea');
        setIdea(data.idea as IdeaDetail);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load idea');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [params.id]);

  const refresh = async () => {
    const res = await fetch(`/api/ideas/${encodeURIComponent(params.id)}`);
    const data = await res.json();
    if (res.ok) setIdea(data.idea as IdeaDetail);
  };

  const handleVote = async () => {
    if (!idea || isVoting) return;
    setIsVoting(true);
    // Optimistic update
    setIdea((prev) =>
      prev
        ? {
            ...prev,
            votes: prev.hasVoted ? prev.votes - 1 : prev.votes + 1,
            hasVoted: !prev.hasVoted,
          }
        : prev
    );
    try {
      const res = await fetch(`/api/ideas/${encodeURIComponent(params.id)}/vote`, {
        method: 'POST',
      });
      if (!res.ok) await refresh();
    } catch {
      await refresh();
    } finally {
      setIsVoting(false);
    }
  };

  const postComment = async () => {
    const msg = comment.trim();
    if (!msg || isPosting) return;
    try {
      setIsPosting(true);
      const res = await fetch(`/api/ideas/${encodeURIComponent(params.id)}/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post comment');
      setComment('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setIsPosting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl">
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !idea) {
    return (
      <div className="max-w-4xl">
        <Card>
          <p className="text-sm text-red-500">{error || 'Idea not found.'}</p>
          <div className="mt-4">
            <a href="/dashboard/ideas">
              <Button variant="secondary">Back to ideas</Button>
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Back link */}
      <div className="mb-6">
        <a href="/dashboard/ideas" className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline">
          <ArrowLeft className="w-4 h-4" /> Back to ideas
        </a>
      </div>

      {/* Header */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={handleVote}
          disabled={isVoting}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg transition-colors shrink-0 ${
            idea.hasVoted
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'bg-background-tertiary text-text-tertiary hover:text-text-primary'
          }`}
        >
          <ChevronUp className="w-5 h-5" />
          <span className="text-lg font-bold">{idea.votes}</span>
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-text-primary">{idea.title}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={`text-sm font-medium ${statusColors[idea.status] || 'text-text-secondary'}`}>
              {statusLabels[idea.status] || idea.status}
            </span>
            <span className="text-xs text-text-tertiary">
              by {idea.author} • {new Date(idea.createdAt).toLocaleDateString()}
            </span>
            {idea.githubIssueNumber && (
              <Badge variant="secondary" className="text-xs">
                GitHub #{idea.githubIssueNumber}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Description</h2>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{idea.description}</p>
      </Card>

      {/* Discussion */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">
          <MessageSquare className="w-5 h-5 inline mr-2" />
          Discussion ({idea.comments.length})
        </h2>

        {idea.comments.length === 0 ? (
          <p className="text-sm text-text-secondary">No comments yet. Start the conversation!</p>
        ) : (
          <div className="space-y-3">
            {idea.comments.map((c) => (
              <div
                key={c.id}
                className={`p-4 rounded-lg border ${
                  c.authorType === 'admin'
                    ? 'bg-accent-primary/5 border-accent-primary/20'
                    : c.authorType === 'ai'
                    ? 'bg-blue-500/5 border-blue-500/20'
                    : 'bg-background-tertiary border-border'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-text-primary">
                    {c.authorName || 'Unknown'}
                  </span>
                  {c.authorType === 'admin' && (
                    <Badge variant="primary" className="text-[10px] px-1.5 py-0">Team</Badge>
                  )}
                  {c.authorType === 'ai' && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">AI</Badge>
                  )}
                  <span className="text-xs text-text-tertiary">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-text-secondary whitespace-pre-wrap">{c.message}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add comment */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Add a comment</h2>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
          placeholder="Share your thoughts, ask a question, or add more context…"
        />
        <div className="mt-3">
          <Button
            variant="primary"
            onClick={postComment}
            disabled={isPosting || !comment.trim()}
          >
            {isPosting ? 'Posting…' : 'Post comment'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
