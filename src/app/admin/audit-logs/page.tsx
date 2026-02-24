'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import {
  FileText,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  CreditCard,
  Shield,
  Settings,
  Filter,
} from 'lucide-react';

interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
}

const actionIcons: Record<string, any> = {
  user: User,
  team: Building2,
  subscription: CreditCard,
  security: Shield,
  settings: Settings,
};

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (entityTypeFilter) params.set('entityType', entityTypeFilter);

      const response = await fetch(`/api/admin/audit-logs?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.logs);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, entityTypeFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const getActionColor = (action: string) => {
    if (action.includes('created')) return 'text-green-500';
    if (action.includes('deleted')) return 'text-red-500';
    if (action.includes('updated')) return 'text-blue-500';
    return 'text-text-secondary';
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Audit Logs</h1>
          <p className="text-text-secondary">Track all administrative actions</p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Types</option>
              <option value="user">User</option>
              <option value="team">Team</option>
              <option value="subscription">Subscription</option>
              <option value="settings">Settings</option>
            </select>
            <Button variant="secondary" onClick={fetchLogs}>
              <Filter className="w-4 h-4 mr-2" />
              Apply
            </Button>
          </div>
        </Card>

        {/* Logs List */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : logs.length > 0 ? (
            <>
              <div className="space-y-4">
                {logs.map((log) => {
                  const Icon = actionIcons[log.entityType] || FileText;
                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-4 p-4 bg-background-tertiary rounded-lg"
                    >
                      <div className="p-2 bg-background-secondary rounded-lg">
                        <Icon className="w-5 h-5 text-text-tertiary" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-medium ${getActionColor(log.action)}`}>
                            {log.action}
                          </span>
                          <Badge variant="secondary">{log.entityType}</Badge>
                        </div>
                        <p className="text-sm text-text-secondary">
                          by <span className="text-text-primary">{log.adminName}</span>
                          {log.ipAddress && (
                            <span className="text-text-tertiary"> • {log.ipAddress}</span>
                          )}
                        </p>
                        {log.metadata && (
                          <pre className="mt-2 text-xs text-text-tertiary bg-background-secondary p-2 rounded overflow-x-auto">
                            {JSON.stringify(JSON.parse(log.metadata), null, 2)}
                          </pre>
                        )}
                      </div>
                      <span className="text-sm text-text-tertiary whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
                <p className="text-sm text-text-secondary">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} logs
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm text-text-primary px-3">
                    Page {pagination.page} of {pagination.totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No audit logs found</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
