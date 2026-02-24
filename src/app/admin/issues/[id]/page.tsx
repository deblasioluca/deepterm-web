'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

const STATUSES = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'] as const;

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
  createdAt: string;
  updatedAt: string;
  reporterFeedback?: string | null;
  reporterFeedbackAt?: string | null;
  user: { id: string; email: string; name: string };
  attachments: IssueAttachment[];
  updates: IssueUpdate[];
};

export default function AdminIssueDetailPage({ params }: { params: { id: string } }) {
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>('open');
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const statusChanged = useMemo(() => {
    if (!issue) return false;
    return status !== issue.status;
  }, [issue, status]);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/issues/${encodeURIComponent(params.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load issue');
      setIssue(data.issue as IssueDetail);
      setStatus((data.issue as IssueDetail).status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [params.id]);

  const saveUpdate = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/admin/issues/${encodeURIComponent(params.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post update');

      setSuccess('Update posted.');
      setMessage('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post update');
    } finally {
      setIsSaving(false);
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
            <a href="/admin/issues">
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
        <a href="/admin/issues" className="text-sm text-accent-primary">← Back to issues</a>
        <div className="flex items-start justify-between gap-3 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{issue.title}</h1>
            <p className="text-sm text-text-tertiary">
              {issue.area} • {issue.user.email} • Created {new Date(issue.createdAt).toLocaleString()}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">{issue.status}</Badge>
        </div>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">Description</h2>
        <p className="whitespace-pre-wrap text-sm text-text-secondary">{issue.description}</p>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-3">User feedback</h2>
        {issue.reporterFeedback ? (
          <div className="flex items-center gap-3 text-sm text-text-secondary">
            {issue.reporterFeedback === 'up' ? (
              <>
                <ThumbsUp className="w-4 h-4" />
                <span>Thumbs up</span>
              </>
            ) : (
              <>
                <ThumbsDown className="w-4 h-4" />
                <span>Thumbs down</span>
              </>
            )}
            {issue.reporterFeedbackAt ? (
              <span className="text-xs text-text-tertiary">
                • {new Date(issue.reporterFeedbackAt).toLocaleString()}
              </span>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">No feedback yet.</p>
        )}
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
                <a href={`/api/admin/issues/${issue.id}/attachments/${a.id}`}>
                  <Button variant="secondary">Download</Button>
                </a>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Post update</h2>

        {error && <div className="mb-3 text-sm text-red-500">{error}</div>}
        {success && <div className="mb-3 text-sm text-green-500">{success}</div>}

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              placeholder="Feedback, steps to try, clarification questions…"
            />
          </div>

          <Button
            variant="secondary"
            onClick={saveUpdate}
            disabled={isSaving || (!message.trim() && !statusChanged)}
          >
            {isSaving ? 'Saving…' : 'Post update'}
          </Button>
        </div>
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
                    {u.authorType === 'admin' ? (u.authorEmail || 'Admin') : 'User'} • {new Date(u.createdAt).toLocaleString()}
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
    </div>
  );
}
