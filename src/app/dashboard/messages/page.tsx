'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Badge } from '@/components/ui';
import {
  Bell,
  Bot,
  MessageSquare,
  Megaphone,
  CheckCheck,
  RefreshCw,
  Filter,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  sourceType: string | null;
  sourceId: string | null;
  isRead: boolean;
  createdAt: string;
};

type Announcement = {
  id: string;
  title: string;
  content: string;
  type: string;
  createdAt: string;
};

const typeConfig: Record<string, { icon: typeof Bell; label: string; color: string; bg: string }> = {
  ai_triage: { icon: Bot, label: 'AI Assistant', color: 'text-blue-400', bg: 'bg-blue-500/10' },
  admin_reply: { icon: MessageSquare, label: 'Team Reply', color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
  status_change: { icon: RefreshCw, label: 'Status Update', color: 'text-accent-secondary', bg: 'bg-accent-secondary/10' },
  announcement: { icon: Megaphone, label: 'Announcement', color: 'text-accent-warning', bg: 'bg-accent-warning/10' },
};

export default function MessagesPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const loadMessages = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/messages?page=${page}&filter=${filter}&limit=20`);
      const data = await res.json();
      if (res.ok) {
        setNotifications(data.notifications);
        setAnnouncements(data.announcements || []);
        setUnreadCount(data.unreadCount);
        setTotalPages(data.pagination.totalPages);
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const markAsRead = async (id: string) => {
    await fetch(`/api/messages/${encodeURIComponent(id)}`, { method: 'PATCH' });
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await fetch('/api/messages/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.isRead) await markAsRead(n.id);
    if (n.linkUrl) window.location.href = n.linkUrl;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Bell className="w-6 h-6" />
            Messages
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Notifications, replies, and announcements
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 && (
            <Button variant="secondary" onClick={markAllRead} className="text-sm">
              <CheckCheck className="w-4 h-4 mr-1.5" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Announcements banner */}
      {announcements.length > 0 && (
        <div className="mb-6 space-y-3">
          {announcements.map((a) => (
            <Card key={a.id} className="border-accent-warning/30 bg-accent-warning/5">
              <div className="flex items-start gap-3">
                <Megaphone className="w-5 h-5 text-accent-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-text-primary">{a.title}</h3>
                  <p className="text-sm text-text-secondary mt-1 line-clamp-2">{a.content}</p>
                  <span className="text-xs text-text-tertiary mt-1 block">{formatDate(a.createdAt)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => { setFilter('all'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            filter === 'all'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
          }`}
        >
          All
        </button>
        <button
          onClick={() => { setFilter('unread'); setPage(1); }}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
            filter === 'unread'
              ? 'bg-accent-primary/20 text-accent-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Unread
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-accent-primary text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notifications list */}
      {isLoading ? (
        <Card>
          <p className="text-sm text-text-secondary">Loading messages…</p>
        </Card>
      ) : notifications.length === 0 ? (
        <Card className="text-center py-12">
          <Bell className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">
            {filter === 'unread' ? 'No unread messages' : 'No messages yet'}
          </p>
          <p className="text-sm text-text-tertiary mt-1">
            You&apos;ll see AI triage questions, team replies, and announcements here.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const config = typeConfig[n.type] || typeConfig.announcement;
            const Icon = config.icon;

            return (
              <button
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left rounded-lg border transition-colors ${
                  n.isRead
                    ? 'bg-background-secondary border-border hover:bg-background-tertiary'
                    : 'bg-background-secondary border-accent-primary/30 hover:bg-accent-primary/5'
                }`}
              >
                <div className="p-4 flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${config.bg} flex-shrink-0`}>
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className={`text-sm font-medium truncate ${
                        n.isRead ? 'text-text-secondary' : 'text-text-primary'
                      }`}>
                        {n.title}
                      </h3>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-accent-primary flex-shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-text-tertiary mt-1 line-clamp-2">
                      {n.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {config.label}
                      </Badge>
                      <span className="text-xs text-text-tertiary">{formatDate(n.createdAt)}</span>
                      {n.linkUrl && (
                        <span className="text-xs text-accent-primary flex items-center gap-0.5 ml-auto">
                          View <ArrowRight className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-sm"
              >
                Previous
              </Button>
              <span className="text-sm text-text-tertiary">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="text-sm"
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
