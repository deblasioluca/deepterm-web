'use client';

import { useEffect, useMemo, useState, use } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import { ThumbsDown, ThumbsUp, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useAdminAI } from '@/components/admin/AdminAIContext';

const STATUSES = ['open', 'in_progress', 'waiting_on_user', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

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
  visibility: string;
  createdAt: string;
};

type IssueDetail = {
  id: string;
  title: string;
  description: string;
  area: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
  reporterFeedback?: string | null;
  reporterFeedbackAt?: string | null;
  user: { id: string; email: string; name: string };
  attachments: IssueAttachment[];
  updates: IssueUpdate[];
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-white/10 text-text-tertiary',
};

export default function AdminIssueDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [issue, setIssue] = useState<IssueDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<string>('open');
  const [message, setMessage] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'internal'>('public');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const statusChanged = useMemo(() => {
    if (!issue) return false;
    return status !== issue.status;
  }, [issue, status]);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    if (!issue) return;
    setPageContext({
      page: 'Issue Detail',
      summary: `Issue: ${issue.title} — ${issue.status} (${issue.priority})`,
      data: {
        issueId: issue.id,
        title: issue.title,
        area: issue.area,
        status: issue.status,
        priority: issue.priority,
        assignedTo: issue.assignedTo,
        reporter: issue.user.email,
        updatesCount: issue.updates.length,
        attachmentsCount: issue.attachments.length,
      },
    });
    return () => setPageContext(null);
  }, [issue, setPageContext]);

  const load = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/issues/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load issue');
      const i = data.issue as IssueDetail;
      setIssue(i);
      setStatus(i.status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const saveUpdate = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`/api/admin/issues/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, message, visibility }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to post update');

      setSuccess('Update posted.');
      setMessage('');
      setVisibility('public');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post update');
    } finally {
      setIsSaving(false);
    }
  };

  const patchField = async (field: string, value: string) => {
    try {
      const res = await fetch(`/api/admin/issues/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok && issue) {
        const data = await res.json();
        setIssue({ ...issue, ...data.issue });
      }
    } catch { /* silent */ }
  };

  if (isLoading) {
    return <div className="max-w-5xl"><p className="text-sm text-text-secondary">Loading…</p></div>;
  }

  if (error && !issue) {
    return (
      <div className="max-w-5xl">
        <Card>
          <p className="text-sm text-red-500">{error}</p>
          <div className="mt-4">
            <Link href="/admin/issues"><Button variant="secondary">Back to issues</Button></Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!issue) return null;

  return (
    <div className="max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link href="/admin/issues" className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline mb-2">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to issues
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">{issue.title}</h1>
            <p className="text-sm text-text-tertiary">
              {issue.area} • {issue.user.email} • Created {new Date(issue.createdAt).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar controls + Description */}
      <div className="grid lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-3">Description</h2>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">{issue.description}</p>
          </Card>

          {/* Attachments */}
          {issue.attachments.length > 0 && (
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-3">Attachments</h2>
              <div className="space-y-2">
                {issue.attachments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 p-3 bg-background-tertiary rounded-lg">
                    <div>
                      <div className="text-sm text-text-primary">{a.originalFilename}</div>
                      <div className="text-xs text-text-tertiary">{a.kind} • {(a.sizeBytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <a href={`/api/admin/issues/${issue.id}/attachments/${a.id}`}>
                      <Button variant="secondary" size="sm">Download</Button>
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* User Feedback */}
          {issue.reporterFeedback && (
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-3">User Feedback</h2>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                {issue.reporterFeedback === 'up' ? <ThumbsUp className="w-4 h-4 text-green-400" /> : <ThumbsDown className="w-4 h-4 text-red-400" />}
                <span>{issue.reporterFeedback === 'up' ? 'Positive' : 'Negative'}</span>
                {issue.reporterFeedbackAt && <span className="text-xs text-text-tertiary">• {new Date(issue.reporterFeedbackAt).toLocaleString()}</span>}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-tertiary mb-1">Status</label>
                <Badge variant="secondary">{issue.status.replace(/_/g, ' ')}</Badge>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-tertiary mb-1">Priority</label>
                <select
                  value={issue.priority}
                  onChange={(e) => patchField('priority', e.target.value)}
                  className="w-full px-3 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-tertiary mb-1">Assigned To</label>
                <input
                  type="text"
                  defaultValue={issue.assignedTo || ''}
                  placeholder="admin email"
                  onBlur={(e) => patchField('assignedTo', e.target.value)}
                  className="w-full px-3 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                />
              </div>
              {issue.firstResponseAt && (
                <div>
                  <label className="block text-xs font-medium text-text-tertiary mb-1">First Response</label>
                  <p className="text-sm text-text-secondary">{new Date(issue.firstResponseAt).toLocaleString()}</p>
                </div>
              )}
              {!issue.firstResponseAt && (
                <div className="flex items-center gap-2 text-xs text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Awaiting first response
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Post update */}
      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Post Update</h2>
        {error && <div className="mb-3 text-sm text-red-500">{error}</div>}
        {success && <div className="mb-3 text-sm text-green-500">{success}</div>}

        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary">
                {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">Visibility</label>
              <button
                type="button"
                onClick={() => setVisibility(visibility === 'public' ? 'internal' : 'public')}
                className={`w-full px-4 py-2.5 border rounded-lg text-sm flex items-center justify-center gap-2 transition-colors ${
                  visibility === 'internal'
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-background-tertiary border-border text-text-primary'
                }`}
              >
                {visibility === 'internal' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {visibility === 'internal' ? 'Internal Note' : 'Public Reply'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              placeholder={visibility === 'internal' ? 'Internal note (not visible to user)…' : 'Reply to user…'} />
          </div>

          <Button variant="secondary" onClick={saveUpdate} disabled={isSaving || (!message.trim() && !statusChanged)}>
            {isSaving ? 'Saving…' : 'Post update'}
          </Button>
        </div>
      </Card>

      {/* Timeline */}
      <Card>
        <h2 className="text-lg font-semibold text-text-primary mb-3">Timeline</h2>
        {issue.updates.length === 0 ? (
          <p className="text-sm text-text-secondary">No updates yet.</p>
        ) : (
          <div className="space-y-3">
            {issue.updates.map((u) => (
              <div key={u.id} className={`p-4 rounded-lg border ${
                u.visibility === 'internal'
                  ? 'bg-amber-500/5 border-amber-500/20'
                  : 'bg-background-tertiary border-border'
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-text-tertiary">
                    <span>{u.authorType === 'admin' ? (u.authorEmail || 'Admin') : 'User'}</span>
                    <span>•</span>
                    <span>{new Date(u.createdAt).toLocaleString()}</span>
                    {u.visibility === 'internal' && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-medium">INTERNAL</span>
                    )}
                  </div>
                  {u.status && <Badge variant="secondary" className="text-xs">{u.status.replace(/_/g, ' ')}</Badge>}
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
