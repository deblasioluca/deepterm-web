'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge, Modal, Input } from '@/components/ui';
import {
  Megaphone,
  Plus,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Calendar,
} from 'lucide-react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'danger';
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
}

const typeOptions = [
  { value: 'info', label: 'Info', color: 'bg-blue-500' },
  { value: 'warning', label: 'Warning', color: 'bg-amber-500' },
  { value: 'success', label: 'Success', color: 'bg-green-500' },
  { value: 'danger', label: 'Critical', color: 'bg-red-500' },
];

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'info' as 'info' | 'warning' | 'success' | 'danger',
    isActive: true,
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchAnnouncements = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);

      const response = await fetch(`/api/admin/announcements?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAnnouncements(data.announcements);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery]);

  useEffect(() => {
    fetchAnnouncements();
  }, [fetchAnnouncements]);

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingAnnouncement(announcement);
      setFormData({
        title: announcement.title,
        content: announcement.content,
        type: announcement.type,
        isActive: announcement.isActive,
        startDate: announcement.startDate || '',
        endDate: announcement.endDate || '',
      });
    } else {
      setEditingAnnouncement(null);
      setFormData({
        title: '',
        content: '',
        type: 'info',
        isActive: true,
        startDate: '',
        endDate: '',
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const url = editingAnnouncement
        ? `/api/admin/announcements/${editingAnnouncement.id}`
        : '/api/admin/announcements';
      
      const response = await fetch(url, {
        method: editingAnnouncement ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        setIsModalOpen(false);
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Failed to save announcement:', error);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (response.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Failed to toggle announcement:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
      const response = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchAnnouncements();
      }
    } catch (error) {
      console.error('Failed to delete announcement:', error);
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Announcements</h1>
            <p className="text-text-secondary">Manage platform announcements</p>
          </div>
          <Button variant="primary" onClick={() => handleOpenModal()}>
            <Plus className="w-4 h-4 mr-2" />
            New Announcement
          </Button>
        </div>

        {/* Search */}
        <Card className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
            <input
              type="text"
              placeholder="Search announcements..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>
        </Card>

        {/* Announcements List */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : announcements.length > 0 ? (
            <>
              <div className="space-y-4">
                {announcements.map((announcement) => {
                  const typeOption = typeOptions.find((t) => t.value === announcement.type);
                  return (
                    <div
                      key={announcement.id}
                      className={`p-4 rounded-lg border ${
                        announcement.isActive
                          ? 'bg-background-tertiary border-border'
                          : 'bg-background-secondary/50 border-border/50 opacity-60'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div
                            className={`w-2 h-2 mt-2 rounded-full ${typeOption?.color || 'bg-blue-500'}`}
                          />
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-text-primary">
                                {announcement.title}
                              </h3>
                              <Badge variant={announcement.isActive ? 'success' : 'secondary'}>
                                {announcement.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-sm text-text-secondary mb-2 line-clamp-2">
                              {announcement.content}
                            </p>
                            <div className="flex items-center gap-4 text-xs text-text-tertiary">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                Created {new Date(announcement.createdAt).toLocaleDateString()}
                              </span>
                              {announcement.startDate && (
                                <span>Start: {new Date(announcement.startDate).toLocaleDateString()}</span>
                              )}
                              {announcement.endDate && (
                                <span>End: {new Date(announcement.endDate).toLocaleDateString()}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleToggleActive(announcement.id, announcement.isActive)
                            }
                            title={announcement.isActive ? 'Deactivate' : 'Activate'}
                          >
                            {announcement.isActive ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenModal(announcement)}
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(announcement.id)}
                            className="text-accent-danger hover:bg-accent-danger/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
                <p className="text-sm text-text-secondary">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total}
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
              <Megaphone className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No announcements yet</p>
              <Button variant="primary" className="mt-4" onClick={() => handleOpenModal()}>
                Create First Announcement
              </Button>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="Announcement title"
          />

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Content
            </label>
            <textarea
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Announcement content..."
              rows={4}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Type
            </label>
            <div className="grid grid-cols-4 gap-2">
              {typeOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFormData({ ...formData, type: option.value as any })}
                  className={`p-3 rounded-lg border text-center transition-all ${
                    formData.type === option.value
                      ? 'border-accent-primary bg-accent-primary/10'
                      : 'border-border hover:border-accent-primary/50'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full mx-auto mb-1 ${option.color}`} />
                  <span className="text-xs text-text-primary">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Start Date (Optional)
              </label>
              <input
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                End Date (Optional)
              </label>
              <input
                type="date"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
            <span className="text-text-primary">Active</span>
            <button
              onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                formData.isActive ? 'bg-accent-primary' : 'bg-background-secondary'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                  formData.isActive ? 'left-7' : 'left-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsModalOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={handleSubmit}
            disabled={!formData.title || !formData.content}
          >
            {editingAnnouncement ? 'Save Changes' : 'Create Announcement'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
