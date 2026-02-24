'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Badge } from '@/components/ui';

const ISSUE_AREAS = [
  'General',
  'SSH Remote Connection',
  'SFTP',
  'Vault',
  'AI Assistant',
  'Other',
] as const;

type IssueRow = {
  id: string;
  title: string;
  area: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function DashboardIssuesPage() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterArea, setFilterArea] = useState<string>('');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [area, setArea] = useState<(typeof ISSUE_AREAS)[number]>('General');
  const [screenshots, setScreenshots] = useState<FileList | null>(null);
  const [logFile, setLogFile] = useState<File | null>(null);

  const fetchIssues = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/issues');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load issues');
      setIssues(Array.isArray(data.issues) ? (data.issues as IssueRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  const submitIssue = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      setSuccess(null);

      const fd = new FormData();
      fd.set('title', title.trim());
      fd.set('description', description.trim());
      fd.set('area', area);

      if (screenshots) {
        Array.from(screenshots).forEach((f) => fd.append('screenshots', f));
      }
      if (logFile) {
        fd.set('log', logFile);
      }

      const res = await fetch('/api/issues', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit issue');

      setSuccess('Issue submitted.');
      setTitle('');
      setDescription('');
      setArea('General');
      setScreenshots(null);
      setLogFile(null);

      await fetchIssues();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit issue');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Issues</h1>
        <p className="text-text-secondary text-sm">
          Report a problem with screenshots and logs. You can track updates here.
        </p>
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Submit an issue</h2>

        {error && (
          <div className="mb-4 text-sm text-red-500">{error}</div>
        )}
        {success && (
          <div className="mb-4 text-sm text-green-500">{success}</div>
        )}

        <div className="grid gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Area</label>
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as any)}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {ISSUE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short summary" />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              placeholder="What happened, what you expected, steps to reproduce…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Screenshots (optional)</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setScreenshots(e.target.files)}
              className="block w-full text-sm text-text-secondary"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Log file (optional)</label>
            <input
              type="file"
              onChange={(e) => setLogFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-text-secondary"
            />
          </div>

          <Button
            variant="primary"
            onClick={submitIssue}
            disabled={isSubmitting || !title.trim() || !description.trim()}
          >
            {isSubmitting ? 'Submitting…' : 'Submit issue'}
          </Button>
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="text-lg font-semibold text-text-primary">Your issues</h2>
          <div className="flex items-center gap-3">
            <select
              value={filterArea}
              onChange={(e) => setFilterArea(e.target.value)}
              className="px-3 py-2 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              aria-label="Filter by area"
            >
              <option value="">All areas</option>
              {ISSUE_AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <div className="w-56">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
              />
            </div>
          </div>
        </div>

        {isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : (() => {
          const q = searchQuery.trim().toLowerCase();
          const filtered = issues.filter((i) => {
            if (filterArea && i.area !== filterArea) return false;
            if (!q) return true;
            return (
              i.title.toLowerCase().includes(q) ||
              i.area.toLowerCase().includes(q) ||
              i.status.toLowerCase().includes(q)
            );
          });

          if (filtered.length === 0) {
            return <p className="text-sm text-text-secondary">No issues found.</p>;
          }

          return (
            <div className="space-y-3">
              {filtered.map((i) => (
                <a key={i.id} href={`/dashboard/issues/${i.id}`} className="block">
                  <div className="p-4 bg-background-tertiary rounded-lg border border-border hover:border-accent-primary/40 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-text-primary">{i.title}</div>
                        <div className="text-xs text-text-tertiary mt-1">
                          {i.area} • Updated {new Date(i.updatedAt).toLocaleString()}
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {i.status}
                      </Badge>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          );
        })()}
      </Card>
    </div>
  );
}
