'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import {
  Apple,
  Search,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  X,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface AppStoreSubscription {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  subscriptionSource: string | null;
  productId: string | null;
  originalTransactionId: string | null;
  purchaseDate: string | null;
  expiresAt: string | null;
  isActive: boolean;
  status: 'active' | 'expired';
  createdAt: string;
}

interface AppStoreStats {
  totalAppStore: number;
  totalActive: number;
  totalExpired: number;
  expiringSoon: number;
  planBreakdown: Record<string, number>;
}

export default function AdminAppleSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<AppStoreSubscription[]>([]);
  const [stats, setStats] = useState<AppStoreStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState<string | null>(null);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Apple Subscriptions',
      summary: `${stats?.totalActive ?? 0} active App Store subscriptions, ${stats?.expiringSoon ?? 0} expiring soon`,
      data: stats ? {
        totalAppStore: stats.totalAppStore,
        activeSubscriptions: stats.totalActive,
        expiredSubscriptions: stats.totalExpired,
        expiringSoon: stats.expiringSoon,
        planBreakdown: stats.planBreakdown,
        statusFilter: statusFilter || 'all',
      } : { loading: true },
    });
    return () => setPageContext(null);
  }, [stats, statusFilter, setPageContext]);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/admin/appstore-subscriptions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch App Store subscriptions');

      const data = await response.json();
      setSubscriptions(data.subscriptions);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load App Store subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, statusFilter]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'business':
        return 'warning';
      case 'team':
        return 'primary';
      case 'pro':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const expires = new Date(expiresAt);
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    return expires <= sevenDaysFromNow && expires > new Date();
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Apple Subscriptions</h1>
            <p className="text-text-secondary">App Store subscription status, renewals, and expiry tracking</p>
          </div>
          <Button variant="secondary" onClick={fetchSubscriptions}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <Apple className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total App Store</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.totalAppStore || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Active</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.totalActive || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Expiring Soon</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.expiringSoon || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl">
                <XCircle className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Expired</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.totalExpired || 0}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Plan Breakdown */}
        {stats?.planBreakdown && Object.keys(stats.planBreakdown).length > 0 && (
          <Card className="mb-6">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Active Subscriptions by Plan</h3>
            <div className="flex gap-4">
              {Object.entries(stats.planBreakdown).map(([plan, count]) => (
                <div key={plan} className="flex items-center gap-2">
                  <Badge variant={getPlanBadgeVariant(plan)}>
                    {plan.charAt(0).toUpperCase() + plan.slice(1)}
                  </Badge>
                  <span className="text-lg font-semibold text-text-primary">{count}</span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search by email..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })); }}
                className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPagination((prev) => ({ ...prev, page: 1 })); }}
              className="px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="expired">Expired</option>
            </select>
          </div>
        </Card>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-red-500">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4 text-red-500" />
            </button>
          </div>
        )}

        {/* Subscriptions Table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : subscriptions.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">User</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Plan</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Product ID</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Purchased</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => (
                      <tr
                        key={sub.id}
                        className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-text-primary">{sub.name || sub.email}</p>
                          {sub.name && (
                            <p className="text-xs text-text-tertiary">{sub.email}</p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={getPlanBadgeVariant(sub.plan)}>
                            {sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Badge variant={sub.isActive ? 'success' : 'danger'}>
                              {sub.status}
                            </Badge>
                            {sub.isActive && isExpiringSoon(sub.expiresAt) && (
                              <Badge variant="warning">Expiring soon</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-xs text-text-tertiary font-mono">
                            {sub.productId || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-secondary text-sm">
                          {formatDate(sub.purchaseDate)}
                        </td>
                        <td className="py-3 px-4 text-text-secondary text-sm">
                          {formatDate(sub.expiresAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
                <p className="text-sm text-text-secondary">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} subscriptions
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
              <Apple className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No App Store subscriptions found</p>
              <p className="text-sm text-text-tertiary mt-1">
                Subscriptions will appear here once users purchase via the macOS App Store.
              </p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
