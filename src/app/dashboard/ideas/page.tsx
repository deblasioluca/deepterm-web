'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import {
  Lightbulb,
  ChevronUp,
  MessageSquare,
  Plus,
  FlaskConical,
  Rocket,
  Filter,
  Loader2,
  ClipboardList,
  Cog,
  XCircle,
} from 'lucide-react';

interface Idea {
  id: string;
  title: string;
  description: string;
  status: 'consideration' | 'planned' | 'in-progress' | 'beta' | 'launched' | 'declined';
  votes: number;
  hasVoted: boolean;
  commentCount: number;
  author: string;
  createdAt: string;
}

const statusConfig = {
  consideration: {
    label: 'Under Consideration',
    icon: Lightbulb,
    color: 'text-yellow-500',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
  },
  planned: {
    label: 'Planned',
    icon: ClipboardList,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/30',
  },
  'in-progress': {
    label: 'In Progress',
    icon: Cog,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  beta: {
    label: 'In Beta',
    icon: FlaskConical,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  launched: {
    label: 'Launched',
    icon: Rocket,
    color: 'text-accent-secondary',
    bg: 'bg-accent-secondary/10',
    border: 'border-accent-secondary/30',
  },
  declined: {
    label: 'Declined',
    icon: XCircle,
    color: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
};

type IdeaStatus = keyof typeof statusConfig;
const allStatuses: IdeaStatus[] = ['consideration', 'planned', 'in-progress', 'beta', 'launched', 'declined'];

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isNewIdeaOpen, setIsNewIdeaOpen] = useState(false);
  const [filter, setFilter] = useState<'all' | IdeaStatus>('all');
  const [newIdea, setNewIdea] = useState({ title: '', description: '' });

  // Fetch ideas on mount
  useEffect(() => {
    fetchIdeas();
  }, []);

  const fetchIdeas = async () => {
    try {
      const response = await fetch('/api/ideas');
      if (response.ok) {
        const data = await response.json();
        setIdeas(data);
      }
    } catch (error) {
      console.error('Failed to fetch ideas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleVote = async (id: string) => {
    // Optimistic update
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === id
          ? {
              ...idea,
              votes: idea.hasVoted ? idea.votes - 1 : idea.votes + 1,
              hasVoted: !idea.hasVoted,
            }
          : idea
      )
    );

    try {
      const response = await fetch(`/api/ideas/${id}/vote`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        // Revert on error
        fetchIdeas();
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      fetchIdeas();
    }
  };

  const handleSubmitIdea = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newIdea),
      });

      if (response.ok) {
        const idea = await response.json();
        setIdeas((prev) => [idea, ...prev]);
        setNewIdea({ title: '', description: '' });
        setIsNewIdeaOpen(false);
      }
    } catch (error) {
      console.error('Failed to submit idea:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredIdeas =
    filter === 'all' ? ideas : ideas.filter((i) => i.status === filter);

  const groupedIdeas = Object.fromEntries(
    allStatuses.map((s) => [s, filteredIdeas.filter((i) => i.status === s)])
  ) as Record<IdeaStatus, Idea[]>;

  return (
    <div className="max-w-6xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Ideas</h1>
            <p className="text-text-secondary">
              Vote on features and submit your own ideas
            </p>
          </div>
          <Button variant="primary" onClick={() => setIsNewIdeaOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Submit Idea
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <Button
            variant={filter === 'all' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All Ideas
          </Button>
          {allStatuses.map((status) => {
            const config = statusConfig[status];
            const StatusIcon = config.icon;
            return (
              <Button
                key={status}
                variant={filter === status ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(status)}
              >
                <StatusIcon className="w-4 h-4 mr-1" />
                {config.label}
              </Button>
            );
          })}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          </div>
        ) : (
        <>
        {/* Kanban Board */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allStatuses.filter((s) => {
            // Only show columns that have ideas, or the standard pipeline ones
            if (filter !== 'all') return s === filter;
            return groupedIdeas[s].length > 0 || ['consideration', 'planned', 'in-progress', 'beta', 'launched'].includes(s);
          }).map((status) => {
            const config = statusConfig[status];
            const StatusIcon = config.icon;
            const statusIdeas = groupedIdeas[status].sort(
              (a, b) => b.votes - a.votes
            );

            if (filter !== 'all' && filter !== status) return null;

            return (
              <div key={status} className="space-y-4">
                <div
                  className={`flex items-center gap-2 p-3 rounded-lg ${config.bg} ${config.border} border`}
                >
                  <StatusIcon className={`w-5 h-5 ${config.color}`} />
                  <h2 className={`font-semibold ${config.color}`}>
                    {config.label}
                  </h2>
                  <Badge variant="secondary" className="ml-auto">
                    {statusIdeas.length}
                  </Badge>
                </div>

                <AnimatePresence>
                  {statusIdeas.map((idea) => (
                    <motion.div
                      key={idea.id}
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                    >
                      <Card className="p-4">
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleVote(idea.id)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-colors ${
                              idea.hasVoted
                                ? 'bg-accent-primary/20 text-accent-primary'
                                : 'bg-background-tertiary text-text-tertiary hover:text-text-primary'
                            }`}
                          >
                            <ChevronUp className="w-4 h-4" />
                            <span className="text-sm font-semibold">
                              {idea.votes}
                            </span>
                          </button>

                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-text-primary mb-1 truncate">
                              {idea.title}
                            </h3>
                            <p className="text-sm text-text-secondary line-clamp-2 mb-3">
                              {idea.description}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-text-tertiary">
                                by {idea.author}
                              </span>
                              <div className="flex items-center gap-1 text-text-tertiary">
                                <MessageSquare className="w-3 h-3" />
                                <span className="text-xs">{idea.commentCount}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {statusIdeas.length === 0 && (
                  <Card className="p-6 text-center">
                    <p className="text-text-tertiary text-sm">
                      No ideas in this category
                    </p>
                  </Card>
                )}
              </div>
            );
          })}
        </div>
        </>
        )}
      </motion.div>

      {/* New Idea Modal */}
      <Modal
        isOpen={isNewIdeaOpen}
        onClose={() => setIsNewIdeaOpen(false)}
        title="Submit New Idea"
        description="Share your feature idea with the community"
      >
        <form onSubmit={handleSubmitIdea} className="space-y-4">
          <Input
            label="Title"
            placeholder="Brief title for your idea"
            value={newIdea.title}
            onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })}
            required
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Description
            </label>
            <textarea
              className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary min-h-[120px]"
              placeholder="Describe your idea in detail. What problem does it solve? How should it work?"
              value={newIdea.description}
              onChange={(e) =>
                setNewIdea({ ...newIdea, description: e.target.value })
              }
              required
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsNewIdeaOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Idea'
              )}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
