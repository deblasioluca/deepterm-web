'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
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
  X,
  AlertTriangle,
  CreditCard,
  Key,
  Shield,
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
  plan: string;
  seats: number;
  memberCount: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  ssoEnabled: boolean;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    plan: 'starter',
    seats: 1,
    ssoEnabled: false,
    ssoDomain: '',
  });

  const fetchTeams = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (planFilter) params.set('plan', planFilter);

      const response = await fetch(`/api/admin/teams?${params}`);
      if (!response.ok) throw new Error('Failed to fetch teams');

      const data = await response.json();
      setTeams(data.teams);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load teams');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, planFilter]);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchTeams();
  };

  const handleCreateTeam = async () => {
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
        throw new Error(data.error || 'Failed to create team');
      }

      setIsCreateModalOpen(false);
      setFormData({ name: '', plan: 'starter', seats: 1, ssoEnabled: false, ssoDomain: '' });
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTeam = async () => {
    if (!selectedTeam) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/teams/${selectedTeam.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update team');
      }

      setIsEditModalOpen(false);
      setSelectedTeam(null);
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/teams/${selectedTeam.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete team');
      }

      setIsDeleteModalOpen(false);
      setSelectedTeam(null);
      fetchTeams();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (team: Team) => {
    setSelectedTeam(team);
    setFormData({
      name: team.name,
      plan: team.plan,
      seats: team.seats,
      ssoEnabled: team.ssoEnabled,
      ssoDomain: '',
    });
    setIsEditModalOpen(true);
  };

  const getPlanBadgeVariant = (plan: string) => {
    switch (plan) {
      case 'enterprise':
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Teams</h1>
            <p className="text-text-secondary">Manage all teams and their subscriptions</p>
          </div>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Team
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search by team name..."
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
              <option value="starter">Starter</option>
              <option value="pro">Pro</option>
              <option value="team">Team</option>
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

        {/* Teams Table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : teams.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Team</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Plan</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Members</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">SSO</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Created</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.map((team) => (
                      <tr
                        key={team.id}
                        className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                              <p className="font-medium text-text-primary">{team.name}</p>
                              <p className="text-sm text-text-secondary">{team.memberCount} members</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={getPlanBadgeVariant(team.plan)}>
                            {team.plan}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-text-tertiary" />
                            <span className="text-text-primary">
                              {team.memberCount} / {team.seats}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={getStatusBadgeVariant(team.subscriptionStatus)}>
                            {team.subscriptionStatus || 'free'}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {team.ssoEnabled ? (
                            <Badge variant="success">
                              <Shield className="w-3 h-3 mr-1" />
                              Enabled
                            </Badge>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-text-secondary">
                          {new Date(team.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(team)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedTeam(team);
                                setIsDeleteModalOpen(true);
                              }}
                              className="text-accent-danger hover:bg-accent-danger/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
                  {pagination.total} teams
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
              <Building2 className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No teams found</p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Create Team Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create New Team"
        description="Set up a new team account"
      >
        <div className="space-y-4">
          <Input
            label="Team Name"
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
              <option value="starter">Starter (Free)</option>
              <option value="pro">Pro ($10/seat/mo)</option>
              <option value="team">Team ($20/seat/mo)</option>
              <option value="enterprise">Enterprise (Custom)</option>
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
            onClick={handleCreateTeam}
            disabled={isSubmitting || !formData.name}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Team'}
          </Button>
        </div>
      </Modal>

      {/* Edit Team Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Team"
        description={`Update ${selectedTeam?.name}`}
      >
        <div className="space-y-4">
          <Input
            label="Team Name"
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
              <option value="starter">Starter (Free)</option>
              <option value="pro">Pro ($10/seat/mo)</option>
              <option value="team">Team ($20/seat/mo)</option>
              <option value="enterprise">Enterprise (Custom)</option>
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
            onClick={handleUpdateTeam}
            disabled={isSubmitting}
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
          </Button>
        </div>
      </Modal>

      {/* Delete Team Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Team"
        description="This action cannot be undone"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-500">Are you sure?</p>
              <p className="text-sm text-text-secondary mt-1">
                This will permanently delete <strong>{selectedTeam?.name}</strong> and remove all
                team associations. Members will not be deleted but will lose access to team resources.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsDeleteModalOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleDeleteTeam} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete Team'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
