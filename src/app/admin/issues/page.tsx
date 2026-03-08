'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Badge, Button } from '@/components/ui';
import { useAdminAI } from '@/components/admin/AdminAIContext';
import {
  Search,
  Loader2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

type AdminIssueRow = {
  id: string;
  title: string;
  area: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: { email: string; name: string };
  _count: { updates: number; attachments: number };
};

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-red-500/20 text-red-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  waiting_on_user: 'bg-amber-500/20 text-amber-400',
  resolved: 'bg-green-500/20 text-green-400',
  closed: 'bg-white/10 text-text-tertiary',
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500/20 text-red-400',
  high: 'bg-orange-500/20 text-orange-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  low: 'bg-white/10 text-text-tertiary',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function AdminIssuesPage() {
  const [issues, setIssues] = useState<AdminIssueRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Issues / Support Inbox',
      summary: `${pagination.total} issues total, page ${pagination.page}`,
      data: {
        total: pagination.total,
        filters: { status: statusFilter || 'all', priority: priorityFilter || 'all', area: areaFilter || 'all' },
      },
    });
    return () => setPageContext(null);
  }, [pagination, statusFilter, priorityFilter, areaFilter, setPageContext]);

  const fetchIssues = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ page: pagination.page.toString(), limit: '25' });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (areaFilter) params.set('area', areaFilter);

      const res = await fetch(`/api/admin/issues?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setIssues(data.issues);
      setPagination(data.pagination);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, search, statusFilter, priorityFilter, areaFilter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((p) => ({ ...p, page: 1 }));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Support Inbox</h1>
          <p className="text-sm text-text-secondary">{pagination.total} issues</p>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search issues..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary">
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_on_user">Waiting on User</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>
          <select value={priorityFilter} onChange={(e) => { setPriorityFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary">
            <option value="">All Priority</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={areaFilter} onChange={(e) => { setAreaFilter(e.target.value); setPagination((p) => ({ ...p, page: 1 })); }}
            className="px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary">
            <option value="">All Areas</option>
            <option value="General">General</option>
            <option value="SSH Remote Connection">SSH</option>
            <option value="SFTP">SFTP</option>
            <option value="Vault">Vault</option>
            <option value="AI Assistant">AI</option>
            <option value="Other">Other</option>
          </select>
          <Button type="submit" variant="secondary" size="sm">Search</Button>
        </form>
      </Card>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Issues List */}
      <Card>
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 text-accent-primary animate-spin" />
          </div>
        ) : issues.length === 0 ? (
          <p className="text-sm text-text-secondary py-8 text-center">No issues found.</p>
        ) : (
          <>
            <div className="space-y-2">
              {issues.map((issue) => (
                <Link key={issue.id} href={`/admin/issues/${issue.id}`} className="block">
                  <div className={`p-4 rounded-lg border transition-colors hover:border-accent-primary/40 ${
                    !issue.firstResponseAt && issue.status === 'open' ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-background-tertiary'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {!issue.firstResponseAt && issue.status === 'open' && (
                            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse flex-shrink-0" />
                          )}
                          <span className="font-medium text-text-primary truncate">{issue.title}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-tertiary">
                          <span>{issue.user.name || issue.user.email}</span>
                          <span>{issue.area}</span>
                          {issue.assignedTo && <span className="text-accent-primary">→ {issue.assignedTo}</span>}
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(issue.updatedAt)}</span>
                          {issue._count.updates > 0 && (
                            <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{issue._count.updates}</span>
                          )}
                          {issue._count.attachments > 0 && (
                            <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{issue._count.attachments}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[issue.priority] || ''}`}>
                          {issue.priority}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[issue.status] || ''}`}>
                          {issue.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                <p className="text-xs text-text-secondary">
                  {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                </p>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" disabled={pagination.page <= 1}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pagination.page >= pagination.totalPages}
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
