'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Badge, Modal, Input } from '@/components/ui';
import {
  Users,
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Mail,
  Shield,
  Building2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
} from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  team: { id: string; name: string; plan: string } | null;
  ideaCount: number;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'member',
    teamId: '',
  });

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (roleFilter) params.set('role', roleFilter);

      const response = await fetch(`/api/admin/users?${params}`);
      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, roleFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchUsers();
  };

  const handleCreateUser = async () => {
    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create user');
      }

      setIsCreateModalOpen(false);
      setFormData({ name: '', email: '', password: '', role: 'member', teamId: '' });
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          password: formData.password || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      setIsEditModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      setIsSubmitting(true);
      setError(null);

      const response = await fetch(`/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete user');
      }

      setIsDeleteModalOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      role: user.role,
      teamId: user.team?.id || '',
    });
    setIsEditModalOpen(true);
  };

  const openDeleteModal = (user: User) => {
    setSelectedUser(user);
    setIsDeleteModalOpen(true);
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner':
        return 'primary';
      case 'admin':
        return 'warning';
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Users</h1>
            <p className="text-text-secondary">
              Manage all users on the platform
            </p>
          </div>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add User
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <form onSubmit={handleSearch} className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="">All Roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
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

        {/* Users Table */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : users.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        User
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Role
                      </th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Team
                      </th>

                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">
                        Joined
                      </th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr
                        key={user.id}
                        className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-accent-primary/20 rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-accent-primary">
                                {user.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-text-primary">
                                {user.name}
                              </p>
                              <p className="text-sm text-text-secondary">
                                {user.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          {user.team ? (
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-text-tertiary" />
                              <span className="text-text-primary">
                                {user.team.name}
                              </span>
                              <Badge variant="secondary" className="text-xs">
                                {user.team.plan}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-text-tertiary">No team</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-text-secondary">
                          {new Date(user.createdAt).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditModal(user)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteModal(user)}
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
                  {pagination.total} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                    }
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
                    onClick={() =>
                      setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                    }
                    disabled={pagination.page >= pagination.totalPages}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No users found</p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Create User Modal */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New User"
        description="Create a new user account"
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="John Doe"
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="john@example.com"
            icon={<Mail className="w-5 h-5" />}
          />
          <Input
            label="Password"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            placeholder="••••••••"
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setIsCreateModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleCreateUser}
            disabled={isSubmitting || !formData.name || !formData.email || !formData.password}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Create User'
            )}
          </Button>
        </div>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit User"
        description={`Update ${selectedUser?.name}'s account`}
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            icon={<Mail className="w-5 h-5" />}
          />
          <Input
            label="New Password (leave blank to keep current)"
            type="password"
            value={formData.password}
            onChange={(e) =>
              setFormData({ ...formData, password: e.target.value })
            }
            placeholder="••••••••"
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setIsEditModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleUpdateUser}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </Modal>

      {/* Delete User Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete User"
        description="This action cannot be undone"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-500">
                Are you sure you want to delete this user?
              </p>
              <p className="text-sm text-text-secondary mt-1">
                This will permanently delete <strong>{selectedUser?.name}</strong>{' '}
                ({selectedUser?.email}) and all their associated data including
                vaults, ideas, and sessions.
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-6">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setIsDeleteModalOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            onClick={handleDeleteUser}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Delete User'
            )}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
