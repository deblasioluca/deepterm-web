'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Key,
  Search,
  Filter,
  Users,
  User,
  Building2,
  Edit2,
  Trash2,
  Plus,
  Loader2,
  Check,
  X,
  Calendar,
  Crown,
  Shield,
  Zap,
} from 'lucide-react';

interface License {
  id: string;
  type: 'team' | 'user';
  name: string;
  email?: string;
  plan: string;
  status: string;
  seats: number;
  memberCount: number;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  ssoEnabled: boolean;
  expiresAt: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
  features: {
    maxVaults: number;
    maxCredentials: number;
    maxTeamMembers: number;
    ssoEnabled: boolean;
    prioritySupport: boolean;
  };
}

const PLAN_COLORS: Record<string, string> = {
  free: 'bg-gray-500/20 text-gray-400',
  starter: 'bg-blue-500/20 text-blue-400',
  pro: 'bg-purple-500/20 text-purple-400',
  team: 'bg-accent-primary/20 text-accent-primary',
  enterprise: 'bg-yellow-500/20 text-yellow-400',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/20 text-green-400',
  trialing: 'bg-blue-500/20 text-blue-400',
  past_due: 'bg-yellow-500/20 text-yellow-400',
  canceled: 'bg-red-500/20 text-red-400',
  incomplete: 'bg-gray-500/20 text-gray-400',
};

export default function LicensesPage() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [plans, setPlans] = useState<string[]>(['free', 'starter', 'pro', 'team', 'enterprise']);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'team' | 'user'>('all');
  const [editingLicense, setEditingLicense] = useState<License | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    plan: 'free',
    seats: 1,
    status: 'active',
    expiresAt: '',
    ssoEnabled: false,
  });

  // Create form state
  const [createForm, setCreateForm] = useState({
    userId: '',
    userName: '',
    userEmail: '',
    teamName: '',
    plan: 'starter',
    seats: 1,
    expiresAt: '',
  });

  useEffect(() => {
    fetchLicenses();
  }, [search, filterType]);

  const fetchLicenses = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterType !== 'all') params.set('type', filterType);

      const response = await fetch(`/api/admin/licenses?${params}`);
      if (response.ok) {
        const data = await response.json();
        setLicenses(data.licenses || []);
        setPlans(data.plans || []);
      }
    } catch (err) {
      console.error('Failed to fetch licenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (license: License) => {
    setEditingLicense(license);
    setEditForm({
      plan: license.plan,
      seats: license.seats,
      status: license.status,
      expiresAt: license.expiresAt ? license.expiresAt.split('T')[0] : '',
      ssoEnabled: license.ssoEnabled,
    });
    setIsEditModalOpen(true);
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const response = await fetch(`/api/admin/users?search=${encodeURIComponent(query)}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        // Filter out users who already have a team (not on free plan)
        const freeUsers = (data.users || []).filter((u: { teamId?: string }) => !u.teamId);
        setSearchResults(freeUsers.slice(0, 5));
      }
    } catch (err) {
      console.error('Failed to search users:', err);
    } finally {
      setSearchingUsers(false);
    }
  };

  const selectUser = (user: { id: string; name: string; email: string }) => {
    setCreateForm({
      ...createForm,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      teamName: `${user.name}'s Team`,
    });
    setUserSearch('');
    setSearchResults([]);
  };

  const handleCreateLicense = async () => {
    if (!createForm.userId || !createForm.teamName || !createForm.plan) {
      console.log('Missing required fields:', createForm);
      alert('Please select a user and fill in all required fields');
      return;
    }
    setSubmitting(true);

    try {
      const response = await fetch('/api/admin/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: createForm.userId,
          teamName: createForm.teamName,
          plan: createForm.plan,
          seats: createForm.seats,
          expiresAt: createForm.expiresAt || null,
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        fetchLicenses();
        setIsCreateModalOpen(false);
        setCreateForm({
          userId: '',
          userName: '',
          userEmail: '',
          teamName: '',
          plan: 'starter',
          seats: 1,
          expiresAt: '',
        });
      } else {
        alert(data.error || 'Failed to create license');
      }
    } catch (err) {
      console.error('Failed to create license:', err);
      alert('Failed to create license. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateLicense = async () => {
    if (!editingLicense) return;
    setSubmitting(true);

    try {
      const response = await fetch(`/api/admin/licenses/${editingLicense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: editingLicense.type,
          ...editForm,
          expiresAt: editForm.expiresAt || null,
        }),
      });

      if (response.ok) {
        fetchLicenses();
        setIsEditModalOpen(false);
        setEditingLicense(null);
      }
    } catch (err) {
      console.error('Failed to update license:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeLicense = async (license: License) => {
    if (!confirm(`Are you sure you want to revoke the license for "${license.name}"? This will delete the team and remove all members.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/licenses/${license.id}?type=${license.type}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchLicenses();
      }
    } catch (err) {
      console.error('Failed to revoke license:', err);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">License Management</h1>
            <p className="text-text-secondary mt-1">
              Manage user and team licenses
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2.5 bg-accent-primary text-background-primary rounded-lg font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add License
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-primary/20 rounded-lg">
                <Key className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">{licenses.length}</p>
                <p className="text-sm text-text-secondary">Total Licenses</p>
              </div>
            </div>
          </div>
          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Building2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {licenses.filter(l => l.type === 'team').length}
                </p>
                <p className="text-sm text-text-secondary">Team Licenses</p>
              </div>
            </div>
          </div>
          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Crown className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {licenses.filter(l => l.plan === 'pro' || l.plan === 'team' || l.plan === 'enterprise').length}
                </p>
                <p className="text-sm text-text-secondary">Paid Plans</p>
              </div>
            </div>
          </div>
          <div className="bg-background-secondary border border-border rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text-primary">
                  {licenses.filter(l => l.status === 'active').length}
                </p>
                <p className="text-sm text-text-secondary">Active</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filterType === 'all'
                  ? 'bg-accent-primary text-background-primary'
                  : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('team')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                filterType === 'team'
                  ? 'bg-accent-primary text-background-primary'
                  : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Teams
            </button>
            <button
              onClick={() => setFilterType('user')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                filterType === 'user'
                  ? 'bg-accent-primary text-background-primary'
                  : 'bg-background-tertiary text-text-secondary hover:text-text-primary'
              }`}
            >
              <User className="w-4 h-4" />
              Individual
            </button>
          </div>
        </div>

        {/* Licenses Table */}
        <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-tertiary border-b border-border">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Plan
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Members
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-text-secondary">
                    Expires
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-text-secondary">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {licenses.map((license) => (
                  <tr key={`${license.type}-${license.id}`} className="hover:bg-background-tertiary/50">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-text-primary">{license.name}</p>
                        {license.email && (
                          <p className="text-sm text-text-tertiary">{license.email}</p>
                        )}
                        {license.type === 'team' && license.members.length > 0 && (
                          <p className="text-sm text-text-tertiary">
                            Owner: {license.members.find(m => m.role === 'owner')?.email || license.members[0]?.email}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                        license.type === 'team' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {license.type === 'team' ? <Building2 className="w-3 h-3" /> : <User className="w-3 h-3" />}
                        {license.type === 'team' ? 'Team' : 'Individual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium capitalize ${PLAN_COLORS[license.plan] || PLAN_COLORS.free}`}>
                        {license.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[license.status] || STATUS_COLORS.active}`}>
                        {license.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-text-secondary">
                      {license.memberCount} / {license.seats === -1 ? '∞' : license.seats}
                    </td>
                    <td className="px-4 py-3 text-text-secondary text-sm">
                      {formatDate(license.expiresAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(license)}
                          className="p-2 text-text-tertiary hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors"
                          title="Edit License"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {license.type === 'team' && (
                          <button
                            onClick={() => handleRevokeLicense(license)}
                            className="p-2 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Revoke License"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {licenses.length === 0 && (
            <div className="text-center py-12">
              <Key className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No licenses found</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Edit License Modal */}
      {isEditModalOpen && editingLicense && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-background-secondary border border-border rounded-xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">Edit License</h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-2 text-text-tertiary hover:text-text-primary rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-sm text-text-secondary">
                {editingLicense.type === 'team' ? 'Team' : 'User'}: <span className="text-text-primary font-medium">{editingLicense.name}</span>
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Plan
                </label>
                <select
                  value={editForm.plan}
                  onChange={(e) => setEditForm({ ...editForm, plan: e.target.value })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {plans.map((plan) => (
                    <option key={plan} value={plan}>
                      {plan.charAt(0).toUpperCase() + plan.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Seats
                </label>
                <input
                  type="number"
                  min="1"
                  value={editForm.seats}
                  onChange={(e) => setEditForm({ ...editForm, seats: parseInt(e.target.value) || 1 })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Status
                </label>
                <select
                  value={editForm.status}
                  onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="active">Active</option>
                  <option value="trialing">Trialing</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Expires At
                </label>
                <input
                  type="date"
                  value={editForm.expiresAt}
                  onChange={(e) => setEditForm({ ...editForm, expiresAt: e.target.value })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editForm.ssoEnabled}
                  onChange={(e) => setEditForm({ ...editForm, ssoEnabled: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-text-primary">SSO Enabled</span>
              </label>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-background-tertiary text-text-secondary rounded-lg hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateLicense}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-accent-primary text-background-primary rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Create License Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-background-secondary border border-border rounded-xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-text-primary">Add License</h2>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateForm({
                    userId: '',
                    userName: '',
                    userEmail: '',
                    teamName: '',
                    plan: 'starter',
                    seats: 1,
                    expiresAt: '',
                  });
                  setUserSearch('');
                  setSearchResults([]);
                }}
                className="p-2 text-text-tertiary hover:text-text-primary rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* User Search */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Select User
                </label>
                {createForm.userId ? (
                  <div className="flex items-center justify-between p-3 bg-background-tertiary border border-border rounded-lg">
                    <div>
                      <p className="font-medium text-text-primary">{createForm.userName}</p>
                      <p className="text-sm text-text-tertiary">{createForm.userEmail}</p>
                    </div>
                    <button
                      onClick={() => setCreateForm({ ...createForm, userId: '', userName: '', userEmail: '', teamName: '' })}
                      className="p-1 text-text-tertiary hover:text-text-primary"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                      type="text"
                      placeholder="Search by name or email..."
                      value={userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        searchUsers(e.target.value);
                      }}
                      className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                    />
                    {searchingUsers && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-text-tertiary" />
                    )}
                    {searchResults.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-background-secondary border border-border rounded-lg shadow-lg overflow-hidden">
                        {searchResults.map((user) => (
                          <button
                            key={user.id}
                            onClick={() => selectUser(user)}
                            className="w-full px-4 py-3 text-left hover:bg-background-tertiary transition-colors"
                          >
                            <p className="font-medium text-text-primary">{user.name}</p>
                            <p className="text-sm text-text-tertiary">{user.email}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-text-tertiary mt-1">
                  Only users without a team (free plan) can be assigned a license
                </p>
              </div>

              {/* Team Name */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Team Name
                </label>
                <input
                  type="text"
                  value={createForm.teamName}
                  onChange={(e) => setCreateForm({ ...createForm, teamName: e.target.value })}
                  placeholder="Enter team name"
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                />
              </div>

              {/* Plan */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Plan
                </label>
                <select
                  value={createForm.plan}
                  onChange={(e) => setCreateForm({ ...createForm, plan: e.target.value })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {plans.filter(p => p !== 'free').map((plan) => (
                    <option key={plan} value={plan}>
                      {plan.charAt(0).toUpperCase() + plan.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Seats */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Seats
                </label>
                <input
                  type="number"
                  min="1"
                  value={createForm.seats}
                  onChange={(e) => setCreateForm({ ...createForm, seats: parseInt(e.target.value) || 1 })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>

              {/* Expires At */}
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Expires At (optional)
                </label>
                <input
                  type="date"
                  value={createForm.expiresAt}
                  onChange={(e) => setCreateForm({ ...createForm, expiresAt: e.target.value })}
                  className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setCreateForm({
                    userId: '',
                    userName: '',
                    userEmail: '',
                    teamName: '',
                    plan: 'starter',
                    seats: 1,
                    expiresAt: '',
                  });
                }}
                disabled={submitting}
                className="flex-1 px-4 py-2.5 bg-background-tertiary text-text-secondary rounded-lg hover:text-text-primary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateLicense}
                disabled={submitting || !createForm.userId || !createForm.teamName}
                className="flex-1 px-4 py-2.5 bg-accent-primary text-background-primary rounded-lg font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create License
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
