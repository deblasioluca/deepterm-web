'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge, Modal } from '@/components/ui';
import {
  MessageSquare,
  ThumbsUp,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Rocket,
  Lightbulb,
  Wrench,
} from 'lucide-react';

interface Idea {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  authorName: string;
  authorEmail: string;
  voteCount: number;
  createdAt: string;
}

const statusOptions = [
  { value: 'consideration', label: 'Under Consideration', color: 'secondary' },
  { value: 'planned', label: 'Planned', color: 'primary' },
  { value: 'in-progress', label: 'In Progress', color: 'warning' },
  { value: 'beta', label: 'Beta', color: 'success' },
  { value: 'launched', label: 'Launched', color: 'success' },
  { value: 'declined', label: 'Declined', color: 'danger' },
];

const categoryIcons: Record<string, any> = {
  feature: Lightbulb,
  improvement: Rocket,
  bug: Wrench,
};

export default function AdminFeedbackPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchIdeas = useCallback(async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/admin/feedback?${params}`);
      if (response.ok) {
        const data = await response.json();
        setIdeas(data.ideas);
        setPagination(data.pagination);
      }
    } catch (error) {
      console.error('Failed to fetch ideas:', error);
    } finally {
      setIsLoading(false);
    }
  }, [pagination.page, pagination.limit, searchQuery, statusFilter]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  const handleUpdateStatus = async () => {
    if (!selectedIdea || !newStatus) return;

    try {
      const response = await fetch(`/api/admin/feedback/${selectedIdea.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setIsUpdateModalOpen(false);
        setSelectedIdea(null);
        fetchIdeas();
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this idea?')) return;

    try {
      const response = await fetch(`/api/admin/feedback/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchIdeas();
      }
    } catch (error) {
      console.error('Failed to delete idea:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find((o) => o.value === status);
    return <Badge variant={option?.color as any || 'secondary'}>{option?.label || status}</Badge>;
  };

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">Feedback & Ideas</h1>
          <p className="text-text-secondary">Manage user-submitted feature requests</p>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search ideas..."
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
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Ideas List */}
        <Card>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
            </div>
          ) : ideas.length > 0 ? (
            <>
              <div className="space-y-4">
                {ideas.map((idea) => {
                  const CategoryIcon = categoryIcons[idea.category] || Lightbulb;
                  return (
                    <div
                      key={idea.id}
                      className="flex items-start gap-4 p-4 bg-background-tertiary rounded-lg"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <div className="p-2 bg-accent-primary/20 rounded-lg">
                          <ThumbsUp className="w-5 h-5 text-accent-primary" />
                        </div>
                        <span className="text-sm font-bold text-text-primary">
                          {idea.voteCount}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CategoryIcon className="w-4 h-4 text-text-tertiary" />
                          <h3 className="font-medium text-text-primary">{idea.title}</h3>
                          {getStatusBadge(idea.status)}
                        </div>
                        <p className="text-sm text-text-secondary mb-2 line-clamp-2">
                          {idea.description}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          by {idea.authorName} • {new Date(idea.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedIdea(idea);
                            setNewStatus(idea.status);
                            setIsUpdateModalOpen(true);
                          }}
                        >
                          Update Status
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(idea.id)}
                          className="text-accent-danger hover:bg-accent-danger/10"
                        >
                          <X className="w-4 h-4" />
                        </Button>
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
                  {pagination.total} ideas
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
              <MessageSquare className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary">No feedback yet</p>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Update Status Modal */}
      <Modal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        title="Update Status"
        description={selectedIdea?.title}
      >
        <div className="space-y-3">
          {statusOptions.map((opt) => (
            <div
              key={opt.value}
              onClick={() => setNewStatus(opt.value)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${
                newStatus === opt.value
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border hover:border-accent-primary/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">{opt.label}</span>
                {newStatus === opt.value && <Check className="w-5 h-5 text-accent-primary" />}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-6">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setIsUpdateModalOpen(false)}
          >
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={handleUpdateStatus}>
            Update Status
          </Button>
        </div>
      </Modal>
    </div>
  );
}
