'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

type IssueAttachment = {
  id: string;
  kind: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type IssueUpdate = {
  id: string;
  authorType: string;
  authorEmail: string | null;
  message: string;
  status: string | null;
  createdAt: string;
};

type IssueDetail = {
  id: string;
  title: string;
  description: string;
  area: string;
  status: string;
  reporterFeedback?: string | null;
  reporterFeedbackAt?: string | null;
  createdAt: string;
  updatedAt: string;
  attachments: IssueAttachment[];
  updates: IssueUpdate[];
};

export default function DashboardIssueDetailPage({ params }: { params: { id: string } }) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/issues/${encodeURIComponent(params.id)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load issue');
        setIssue(data.issue as IssueDetail);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load issue');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [params.id]);

  const refresh = async () => {
    const res = await fetch(`/api/issues/${encodeURIComponent(params.id)}`);
    const data = await res.json();
    if (res.ok) setIssue(data.issue as IssueDetail);
  };

  const postComment = async () => {
    try {
      setIsPosting(true);
      const msg = comment.trim();
      if (!msg) return;

      const res = await fetch(`/api/issues/${encodeURIComponent(params.id)}/comment`, {
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

  const setFeedback = async (feedback: 'up' | 'down' | null) => {
    try {
      setIsSavingFeedback(true);
      const res = await fetch(`/api/issues/${encodeURIComponent(params.id)}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedback }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save feedback');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save feedback');
    } finally {
      setIsSavingFeedback(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl">
        <p className="text-sm text-text-secondary">Loading…</p>
      </div>
    );
  }

  if (error || !issue) {
    return (
      <div className="max-w-5xl">
        <Card>
          <p className="text-sm text-red-500">{error || 'Issue not found.'}</p>
          <div className="mt-4">
            <a href="/dashboard/issues">
              <Button variant="secondary">Back to issues</Button>
            </a>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <a href="/dashboard/issues" className="text-sm text-accent-primary">← Back to issues</a>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{issue.title}</h1>
            <p className="text-sm text-text-tertiary">
              {issue.area} • Created {new Date(issue.createdAt).toLocaleString()}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">{issue.status}</Badge>
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Feedback</h2>
        <p className="text-sm text-text-secondary mb-4">
          Was the latest admin response helpful?
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => setFeedback(issue.reporterFeedback === 'up' ? null : 'up')}
            disabled={isSavingFeedback}
          >
            <ThumbsUp className="w-4 h-4 mr-2" />
            {issue.reporterFeedback === 'up' ? 'Thumbs up (set)' : 'Thumbs up'}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setFeedback(issue.reporterFeedback === 'down' ? null : 'down')}
            disabled={isSavingFeedback}
          >
            <ThumbsDown className="w-4 h-4 mr-2" />
            {issue.reporterFeedback === 'down' ? 'Thumbs down (set)' : 'Thumbs down'}
          </Button>
          {issue.reporterFeedbackAt ? (
            <span className="text-xs text-text-tertiary">
              Saved {new Date(issue.reporterFeedbackAt).toLocaleString()}
            </span>
          ) : null}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Description</h2>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{issue.description}</p>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Attachments</h2>
        {issue.attachments.length === 0 ? (
          <p className="text-sm text-text-secondary">No attachments.</p>
        ) : (
          <div className="space-y-2">
            {issue.attachments.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-background-tertiary rounded-lg">
                <div>
                  <div className="text-sm text-text-primary">{a.originalFilename}</div>
                  <div className="text-xs text-text-tertiary">{a.kind} • {(a.sizeBytes / 1024).toFixed(1)} KB</div>
                </div>
                <a href={`/api/issues/${issue.id}/attachments/${a.id}`}>
                  <Button variant="secondary">Download</Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Updates</h2>
        {issue.updates.length === 0 ? (
          <p className="text-sm text-text-secondary">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {issue.updates.map((u) => (
              <div key={u.id} className="p-4 bg-background-tertiary rounded-lg border border-border">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-text-tertiary">
                    {u.authorType === 'admin' ? 'Admin' : 'You'} • {new Date(u.createdAt).toLocaleString()}
                  </div>
                  {u.status ? (
                    <Badge variant="secondary" className="text-xs">{u.status}</Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-sm text-text-secondary whitespace-pre-wrap">{u.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Add a comment</h2>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
          placeholder="Add more details, answer questions, or share additional context…"
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
