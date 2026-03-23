'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge, Modal } from '@/components/ui';
import {
  CreditCard,
  Search,
  DollarSign,
  TrendingUp,
  Users,
  Loader2,
  Save,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

type Offering = {
  key: string;
  interval: 'monthly' | 'yearly';
  stage: 'draft' | 'live';
  name: string;
  description?: string | null;
  priceCents: number;
  currency: string;
  isActive: boolean;
};

interface Subscription {
  id: string;
  name: string;
  plan: string;
  seats: number;
  memberCount: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
}

interface SubscriptionStats {
  totalActive: number;
  totalRevenue: number;
  churnRate: number;
  avgSeats: number;
}

export default function AdminSubscriptionsPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [stats, setStats] = useState<SubscriptionStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [draftOfferings, setDraftOfferings] = useState<Offering[]>([]);
  const [liveOfferings, setLiveOfferings] = useState<Offering[]>([]);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [offeringsMessage, setOfferingsMessage] = useState<string | null>(null);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Subscriptions',
      summary: `${stats?.totalActive ?? 0} active subscriptions — MRR $${((stats?.totalRevenue ?? 0) / 100).toLocaleString()}`,
      data: stats ? {
        activeSubscriptions: stats.totalActive,
        mrr: `$${(stats.totalRevenue / 100).toLocaleString()}`,
        churnRate: `${stats.churnRate?.toFixed(1)}%`,
        avgSeatsPerOrg: stats.avgSeats?.toFixed(1),
        totalSubscriptions: pagination.total,
        statusFilter: statusFilter || 'all',
      } : { loading: true },
    });
    return () => setPageContext(null);
  }, [stats, pagination.total, statusFilter, setPageContext]);

  const fetchOfferings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscription-offerings');
      if (!res.ok) return;
      const data = await res.json();
      setDraftOfferings((data?.draft || []) as Offering[]);
      setLiveOfferings((data?.live || []) as Offering[]);
    } catch (e) {
      // ignore
    }
  }, []);

  const fetchSubscriptions = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/admin/subscriptions?${params}`);
      if (!response.ok) throw new Error('Failed to fetch subscriptions');

      const data = await response.json();
      setSubscriptions(data.subscriptions);
      setStats(data.stats);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscriptions');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, statusFilter]);

  useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  useEffect(() => {
    fetchOfferings();
  }, [fetchOfferings]);

  const updateDraftRow = (idx: number, patch: Partial<Offering>) => {
    setDraftOfferings((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addDraftOffering = () => {
    setDraftOfferings((rows) => [
      ...rows,
      {
        key: 'pro',
        interval: 'monthly',
        stage: 'draft',
        name: 'Pro',
        description: null,
        priceCents: 1299,
        currency: 'usd',
        isActive: true,
      },
    ]);
  };

  const removeDraftOffering = (idx: number) => {
    setDraftOfferings((rows) => rows.filter((_, i) => i !== idx));
  };

  const saveDraft = async () => {
    try {
      setIsSavingDraft(true);
      setOfferingsMessage(null);
      setError(null);

      const res = await fetch('/api/admin/subscription-offerings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          draft: draftOfferings.map((o) => ({
            key: o.key,
            interval: o.interval,
            name: o.name,
            description: o.description || null,
            priceCents: Number(o.priceCents) || 0,
            currency: o.currency || 'usd',
            isActive: Boolean(o.isActive),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save draft');

      setOfferingsMessage('Draft saved');
      setTimeout(() => setOfferingsMessage(null), 3000);
      await fetchOfferings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const deployDraft = async () => {
    try {
      setIsDeploying(true);
      setOfferingsMessage(null);
      setError(null);

      const res = await fetch('/api/admin/subscription-offerings/deploy', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deploy');

      setOfferingsMessage('Deployed to live');
      setTimeout(() => setOfferingsMessage(null), 5000);
      await fetchOfferings();
      await fetchSubscriptions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deploy');
    } finally {
      setIsDeploying(false);
    }
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'trialing':
        return 'primary';
      case 'past_due':
        return 'danger';
      case 'canceled':
        return 'secondary';
      default:
        return 'secondary';
    }
  };

  const getPlanPrice = (plan: string): number => {
    const prices: Record<string, number> = {
      pro: 10,
      team: 20,
      enterprise: 50,
    };
    return prices[plan] || 0;
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Subscriptions</h1>
            <p className="text-text-secondary">Manage billing and subscription status</p>
          </div>
          <Button variant="secondary" onClick={fetchSubscriptions}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Offerings — moved to Settings → Billing */}
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Subscription Offerings</h2>
              <p className="text-sm text-text-secondary">
                Manage pricing plans and deploy changes from Settings → Billing.
              </p>
            </div>
            <a
              href="/admin/settings?tab=billing"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-lg text-sm font-medium hover:bg-accent-primary/20 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Manage Offerings
            </a>
          </div>
          <div className="mt-3 text-sm text-text-tertiary">
            Live offerings: {liveOfferings.filter((o) => o.isActive).length} active
          </div>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <CreditCard className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Active Subscriptions</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.totalActive || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <DollarSign className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Monthly Revenue</p>
                <p className="text-2xl font-bold text-text-primary">
                  ${((stats?.totalRevenue || 0) / 100).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Avg Seats/Org</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.avgSeats?.toFixed(1) || '0'}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 rounded-xl">
                <TrendingUp className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Churn Rate</p>
                <p className="text-2xl font-bold text-text-primary">
                  {stats?.churnRate?.toFixed(1) || '0'}%
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search by organization name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="trialing">Trialing</option>
              <option value="past_due">Past Due</option>
              <option value="canceled">Canceled</option>
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
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Organization</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Plan</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Seats</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">MRR</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Renews</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((sub) => (
                      <tr
                        key={sub.id}
                        className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50"
                      >
                        <td className="py-3 px-4">
                          <p className="font-medium text-text-primary">{sub.name}</p>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant="primary">{sub.plan}</Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Badge variant={getStatusBadgeVariant(sub.subscriptionStatus)}>
                              {sub.subscriptionStatus || 'free'}
                            </Badge>
                            {sub.cancelAtPeriodEnd && (
                              <Badge variant="warning">Canceling</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-text-primary">
                          {sub.memberCount} / {sub.seats}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-text-primary">
                            ${(getPlanPrice(sub.plan) * sub.seats).toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-text-secondary">
                          {sub.currentPeriodEnd
                            ? new Date(sub.currentPeriodEnd).toLocaleDateString()
                            : '—'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {sub.stripeCustomerId && (
                            <a
                              href={`https://dashboard.stripe.com/customers/${sub.stripeCustomerId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </a>
                          )}
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
              <CreditCard className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No subscriptions found</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
