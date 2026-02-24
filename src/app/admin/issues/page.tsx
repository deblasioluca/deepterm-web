'use client';

import { useEffect, useState } from 'react';
import { Card, Badge, Button, Input } from '@/components/ui';

type AdminIssueRow = {
  id: string;
  title: string;
  area: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { email: string; name: string };
};

export default function AdminIssuesPage() {
  const [issues, setIssues] = useState<AdminIssueRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/admin/issues');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load issues');
        setIssues(Array.isArray(data.issues) ? (data.issues as AdminIssueRow[]) : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load issues');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const filtered = issues.filter((i) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      i.title.toLowerCase().includes(q) ||
      i.area.toLowerCase().includes(q) ||
      i.status.toLowerCase().includes(q) ||
      i.user.email.toLowerCase().includes(q) ||
      i.user.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-5xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Issues</h1>
          <p className="text-sm text-text-secondary">Manage user-reported issues and post updates.</p>
        </div>
        <div className="w-72">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
        </div>
      </div>

      <Card>
        {error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : isLoading ? (
          <p className="text-sm text-text-secondary">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-text-secondary">No issues found.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((i) => (
              <a key={i.id} href={`/admin/issues/${i.id}`} className="block">
                <div className="p-4 bg-background-tertiary rounded-lg border border-border hover:border-accent-primary/40 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-text-primary">{i.title}</div>
                      <div className="text-xs text-text-tertiary mt-1">
                        {i.area} • {i.user.email} • Updated {new Date(i.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">{i.status}</Badge>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        <div className="mt-4">
          <a href="/admin">
            <Button variant="secondary">Back to admin</Button>
          </a>
        </div>
      </Card>
    </div>
  );
}
