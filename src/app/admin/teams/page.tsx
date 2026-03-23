'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Badge, Modal, Input } from '@/components/ui';
import {
  Building2,
  Search,
  Plus,
  Edit,
  Trash2,
  Users,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  AlertTriangle,
  CreditCard,
  Shield,
  Network,
  ExternalLink,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface OrgTeam {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  allowFederation: boolean;
  memberCount: number;
  createdAt: string;
}

interface Organization {
  id: string;
  name: string;
  plan: string;
  seats: number;
  memberCount: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  ssoEnabled: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  cancelAtPeriodEnd: boolean;
  billingEmail: string | null;
  createdAt: string;
  orgTeams: OrgTeam[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminTeamsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    plan: 'free',
    seats: 1,
    ssoEnabled: false,
    ssoDomain: '',
  });

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Organizations',
      summary: `Managing ${pagination.total} organizations`,
      data: {
        totalOrganizations: pagination.total,
        currentPage: pagination.page,
        planFilter: planFilter || 'all',
        search: searchQuery || null,
        selectedOrg: selectedOrg?.name ?? null,
      },
    });
    return () => setPageContext(null);
  }, [pagination.total, pagination.page, planFilter, searchQuery, selectedOrg, setPageContext]);

  const fetchOrganizations = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (planFilter) params.set('plan', planFilter);

      const response = await fetch(`/api/admin/teams?${params}`);
      if (!response.ok) throw new Error('Failed to fetch organizations');

      const data = await response.json();
      setOrganizations(data.teams);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load organizations');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, planFilter]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchOrganizations();
  };

  const toggleExpand = (orgId: string) => {
    setExpandedOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const handleCreateOrg = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch('/api/admin/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create organization');
      }

      setIsCreateModalOpen(false);
      setFormData({ name: '', plan: 'free', seats: 1, ssoEnabled: false, ssoDomain: '' });
      fetchOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateOrg = async () => {
    if (!selectedOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/teams/${selectedOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update organization');
      }

      setIsEditModalOpen(false);
      setSelectedOrg(null);
      fetchOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteOrg = async () => {
    if (!selectedOrg) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/teams/${selectedOrg.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete organization');
      }

      setIsDeleteModalOpen(false);
      setSelectedOrg(null);
      fetchOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete organization');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (org: Organization) => {
    setSelectedOrg(org);
    setFormData({
      name: org.name,
      plan: org.plan,
      seats: org.seats,
      ssoEnabled: org.ssoEnabled,
      ssoDomain: '',
    });
    setIsEditModalOpen(true);
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'enterprise':
        return 'primary';
      case 'business':
        return 'primary';
      case 'team':
        return 'warning';
      case 'pro':
        return 'success';
      default:
        return 'secondary';
    }
  };

  const getStatusBadgeVariant = (status: string | null) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'past_due':
        return 'danger';
      case 'canceled':
        return 'secondary';
      default:
        return 'secondary';
    }
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Organizations</h1>
            <p className="text-text-secondary">Manage organizations, teams, and subscriptions</p>
          </div>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Organization
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
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
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Plans</option>
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
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

        {/* Organizations List */}
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
              </div>
            </Card>
          ) : organizations.length > 0 ? (
            organizations.map((org) => (
              <Card key={org.id} className="overflow-hidden">
                {/* Organization Header Row */}
                <div className="flex items-center gap-4 p-4">
                  <button
                    onClick={() => toggleExpand(org.id)}
                    className="p-1 rounded hover:bg-background-tertiary text-text-secondary"
                  >
                    {expandedOrgs.has(org.id) ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-purple-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-text-primary truncate">{org.name}</p>
                      {org.billingEmail && (
                        <span className="text-xs text-text-tertiary truncate">{org.billingEmail}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-sm text-text-secondary">
                        <Users className="w-3.5 h-3.5 inline mr-1" />
                        {org.memberCount} / {org.seats} members
                      </span>
                      <span className="text-sm text-text-secondary">
                        <Network className="w-3.5 h-3.5 inline mr-1" />
                        {org.orgTeams.length} teams
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={getPlanBadgeVariant(org.plan)}>{org.plan}</Badge>
                    <Badge variant={getStatusBadgeVariant(org.subscriptionStatus)}>
                      {org.subscriptionStatus || 'free'}
                    </Badge>
                    {org.cancelAtPeriodEnd && <Badge variant="warning">Canceling</Badge>}
                    {org.ssoEnabled && (
                      <Badge variant="success">
                        <Shield className="w-3 h-3 mr-1" /> SSO
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {org.stripeCustomerId && (
                      <a
                        href={`https://dashboard.stripe.com/customers/${org.stripeCustomerId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View in Stripe"
                      >
                        <Button variant="ghost" size="sm">
                          <CreditCard className="w-4 h-4" />
                        </Button>
                      </a>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(org)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedOrg(org);
                        setIsDeleteModalOpen(true);
                      }}
                      className="text-accent-danger hover:bg-accent-danger/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded OrgTeams */}
                <AnimatePresence>
                  {expandedOrgs.has(org.id) && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border bg-background-tertiary/30">
                        {/* Subscription details */}
                        <div className="px-6 py-3 border-b border-border/50">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-text-tertiary">Plan</span>
                              <p className="text-text-primary font-medium">{org.plan}</p>
                            </div>
                            <div>
                              <span className="text-text-tertiary">Period End</span>
                              <p className="text-text-primary font-medium">
                                {org.currentPeriodEnd
                                  ? new Date(org.currentPeriodEnd).toLocaleDateString()
                                  : '—'}
                              </p>
                            </div>
                            <div>
                              <span className="text-text-tertiary">Stripe</span>
                              <p className="text-text-primary font-medium">
                                {org.stripeSubscriptionId ? (
                                  <a
                                    href={`https://dashboard.stripe.com/subscriptions/${org.stripeSubscriptionId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent-primary hover:underline inline-flex items-center gap-1"
                                  >
                                    {org.stripeSubscriptionId.slice(0, 16)}...
                                    <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  '—'
                                )}
                              </p>
                            </div>
                            <div>
                              <span className="text-text-tertiary">Created</span>
                              <p className="text-text-primary font-medium">
                                {new Date(org.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Teams list */}
                        {org.orgTeams.length > 0 ? (
                          <div className="px-6 py-3">
                            <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">Teams</p>
                            <div className="space-y-2">
                              {org.orgTeams.map((team) => (
                                <div
                                  key={team.id}
                                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-background-secondary/50"
                                >
                                  <div className="flex items-center gap-3">
                                    <Network className="w-4 h-4 text-text-tertiary" />
                                    <div>
                                      <span className="text-sm font-medium text-text-primary">
                                        {team.name}
                                      </span>
                                      {team.isDefault && (
                                        <Badge variant="secondary" className="ml-2 text-xs">
                                          Default
                                        </Badge>
                                      )}
                                      {team.allowFederation && (
                                        <Badge variant="primary" className="ml-2 text-xs">
                                          Federated
                                        </Badge>
                                      )}
                                      {team.description && (
                                        <p className="text-xs text-text-tertiary mt-0.5">
                                          {team.description}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-text-secondary">
                                      <Users className="w-3.5 h-3.5 inline mr-1" />
                                      {team.memberCount}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="px-6 py-4 text-sm text-text-tertiary">
                            No teams created yet
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            ))
          ) : (
            <Card>
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
                <p className="text-text-secondary">No organizations found</p>
              </div>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-text-secondary">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} organizations
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
        )}
      </motion.div>

      {/* Create Organization Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Organization"
        description="Set up a new organization"
      >
        <div className="space-y-4">
          <Input
            label="Organization Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Acme Inc."
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Plan</label>
            <select
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Seats</label>
            <input
              type="number"
              min="1"
              value={formData.seats}
              onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsCreateModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleCreateOrg}
            disabled={isSubmitting || !formData.name}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Organization'}
          </Button>
        </div>
      </Modal>

      {/* Edit Organization Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Organization"
        description={`Update ${selectedOrg?.name}`}
      >
        <div className="space-y-4">
          <Input
            label="Organization Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Plan</label>
            <select
              value={formData.plan}
              onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="free">Free</option>
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
              <option value="business">Business</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Seats</label>
            <input
              type="number"
              min="1"
              value={formData.seats}
              onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 1 })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="ssoEnabled"
              checked={formData.ssoEnabled}
              onChange={(e) => setFormData({ ...formData, ssoEnabled: e.target.checked })}
              className="w-4 h-4 rounded border-border"
            />
            <label htmlFor="ssoEnabled" className="text-sm text-text-primary">
              Enable SSO
            </label>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsEditModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleUpdateOrg}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      </Modal>

      {/* Delete Organization Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Organization"
        description="This action cannot be undone"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-500">Are you sure?</p>
              <p className="text-sm text-text-secondary mt-1">
                This will permanently delete <strong>{selectedOrg?.name}</strong> and all its teams,
                vaults, and member associations. Members will not be deleted but will lose access to
                organization resources.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteOrg} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Organization'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
