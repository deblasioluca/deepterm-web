'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DOMPurify from 'dompurify';
import {
  Mail,
  Plus,
  Trash2,
  Edit3,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowRight,
  Clock,
  RefreshCw,
  AlertCircle,
  Search,
  Inbox,
  Send,
  FileText,
  Archive,
  Zap,
  Download,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface Alias {
  id: number;
  alias: string;
  forward: string;
  created: number;
}

interface LogEntry {
  id: string;
  created: number;
  sender: { address: string; name: string };
  recipient: string;
  subject: string;
  transport: string;
  events: Array<{
    id: string;
    created: number;
    status: string;
    code: number;
    local: string;
    server: string;
    message: string;
  }>;
}

interface EmailDraft {
  id: string;
  emailMessageId: string;
  draftBody: string;
  draftText: string;
  status: string;
  editedBody: string | null;
  sentAt: string | null;
  sentFrom: string | null;
  model: string;
  createdAt: string;
  emailMessage?: {
    id: string;
    from: string;
    fromName: string;
    to: string;
    subject: string;
    classification: string | null;
    priority: string | null;
    receivedAt: string;
  };
}

interface EmailMessage {
  id: string;
  gmailMessageId: string;
  threadId: string | null;
  from: string;
  fromName: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  receivedAt: string;
  classification: string | null;
  priority: string | null;
  sentiment: string | null;
  actionItems: string | null;
  classifiedAt: string | null;
  status: string;
  linkedUserId: string | null;
  linkedIssueId: string | null;
  linkedIdeaId: string | null;
  createdAt: string;
  drafts?: EmailDraft[];
}

interface InboxCounts {
  unread: number;
  read: number;
  replied: number;
  archived: number;
  spam: number;
  total: number;
}

type TabKey = 'inbox' | 'drafts' | 'sent' | 'aliases' | 'logs';

// ── Classification helpers ───────────────────────────────────────────────────

const classificationConfig: Record<string, { label: string; color: string }> = {
  support_request: { label: 'Support', color: 'text-blue-400 bg-blue-500/10' },
  bug_report: { label: 'Bug', color: 'text-red-400 bg-red-500/10' },
  feature_request: { label: 'Feature', color: 'text-purple-400 bg-purple-500/10' },
  billing_inquiry: { label: 'Billing', color: 'text-yellow-400 bg-yellow-500/10' },
  partnership: { label: 'Partnership', color: 'text-green-400 bg-green-500/10' },
  spam: { label: 'Spam', color: 'text-text-tertiary bg-background-tertiary' },
  personal: { label: 'Personal', color: 'text-accent-primary bg-accent-primary/10' },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  P0: { label: 'P0', color: 'text-red-400 bg-red-500/10 border-red-500/30' },
  P1: { label: 'P1', color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
  P2: { label: 'P2', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' },
  P3: { label: 'P3', color: 'text-text-tertiary bg-background-tertiary border-border' },
};

const sentimentConfig: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positive', color: 'text-green-400' },
  neutral: { label: 'Neutral', color: 'text-text-tertiary' },
  negative: { label: 'Negative', color: 'text-red-400' },
};

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminEmailPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('inbox');

  // Existing state
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);

  // Inbox state
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [inboxCounts, setInboxCounts] = useState<InboxCounts>({
    unread: 0, read: 0, replied: 0, archived: 0, spam: 0, total: 0,
  });
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxFilter, setInboxFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [ingesting, setIngesting] = useState(false);

  // Drafts state
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState<string | null>(null);
  const [sendingDraft, setSendingDraft] = useState<string | null>(null);

  // Create alias form
  const [showCreate, setShowCreate] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newForward, setNewForward] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit alias form
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForward, setEditForward] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState('');

  const DOMAIN = 'deepterm.net';

  const showFeedback = useCallback((ok: boolean, msg: string) => {
    setFeedback({ ok, msg });
    setTimeout(() => setFeedback(null), 5000);
  }, []);

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchAliases = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/email/aliases');
      if (res.ok) {
        const data = (await res.json()) as { aliases: Alias[] };
        setAliases(data.aliases);
      }
    } catch (err) {
      console.error('Failed to fetch aliases:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/admin/email/activity');
      if (res.ok) {
        const data = (await res.json()) as { logs: LogEntry[] };
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchInbox = useCallback(async () => {
    try {
      setInboxLoading(true);
      const params = new URLSearchParams();
      if (inboxFilter !== 'all') params.set('status', inboxFilter);
      if (classFilter !== 'all') params.set('classification', classFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (searchQuery) params.set('search', searchQuery);

      const res = await fetch(`/api/admin/email/inbox?${params.toString()}`);
      if (res.ok) {
        const data = (await res.json()) as { messages: EmailMessage[]; counts: InboxCounts };
        setMessages(data.messages);
        setInboxCounts(data.counts);
      }
    } catch (err) {
      console.error('Failed to fetch inbox:', err);
    } finally {
      setInboxLoading(false);
    }
  }, [inboxFilter, classFilter, priorityFilter, searchQuery]);

  const fetchDrafts = useCallback(async () => {
    try {
      setDraftsLoading(true);
      const res = await fetch('/api/admin/email/draft');
      if (res.ok) {
        const data = (await res.json()) as { drafts: EmailDraft[] };
        setDrafts(data.drafts);
      }
    } catch (err) {
      console.error('Failed to fetch drafts:', err);
    } finally {
      setDraftsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'aliases') fetchAliases();
    if (activeTab === 'logs') fetchLogs();
    if (activeTab === 'drafts' || activeTab === 'sent') fetchDrafts();
  }, [activeTab, fetchAliases, fetchLogs, fetchDrafts]);

  // Separate effect for inbox — fetchInbox already depends on filter values,
  // so this single effect handles both tab-switch and filter-change triggers.
  useEffect(() => {
    if (activeTab === 'inbox') fetchInbox();
  }, [activeTab, fetchInbox]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const handleIngest = async () => {
    try {
      setIngesting(true);
      const res = await fetch('/api/admin/email/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sinceHours: 48 }),
      });
      const data = (await res.json()) as { ingested?: number; errors?: number; message?: string };
      if (res.ok) {
        showFeedback(true, `Ingested ${data.ingested ?? 0} emails (${data.errors ?? 0} errors)`);
        await fetchInbox();
      } else {
        showFeedback(false, data.message || 'Ingestion failed');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Ingestion failed');
    } finally {
      setIngesting(false);
    }
  };

  const handleStatusUpdate = async (ids: string[], status: string) => {
    try {
      const res = await fetch('/api/admin/email/inbox', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      });
      if (res.ok) {
        showFeedback(true, `Updated ${ids.length} email(s)`);
        await fetchInbox();
        if (selectedMessage && ids.includes(selectedMessage.id)) {
          setSelectedMessage(null);
        }
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDeleteMessage = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/email/inbox/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showFeedback(true, 'Email deleted');
        await fetchInbox();
        if (selectedMessage?.id === id) setSelectedMessage(null);
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleGenerateDraft = async (emailMessageId: string) => {
    try {
      setGeneratingDraft(emailMessageId);
      const res = await fetch('/api/admin/email/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailMessageId }),
      });
      if (res.ok) {
        showFeedback(true, 'Draft generated');
        await fetchDrafts();
        setActiveTab('drafts');
      } else {
        const data = (await res.json()) as { message?: string };
        showFeedback(false, data.message || 'Draft generation failed');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Draft generation failed');
    } finally {
      setGeneratingDraft(null);
    }
  };

  const handleSendDraft = async (draftId: string) => {
    try {
      setSendingDraft(draftId);
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftId }),
      });
      const data = (await res.json()) as { success?: boolean; sentTo?: string; message?: string };
      if (res.ok && data.success) {
        showFeedback(true, `Reply sent to ${data.sentTo}`);
        await fetchDrafts();
      } else {
        showFeedback(false, data.message || 'Send failed');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSendingDraft(null);
    }
  };

  const handleDiscardDraft = async (draftId: string) => {
    try {
      await fetch(`/api/admin/email/draft/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'discarded' }),
      });
      showFeedback(true, 'Draft discarded');
      await fetchDrafts();
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Discard failed');
    }
  };

  const handleCreate = async () => {
    if (!newAlias || !newForward) return;
    try {
      setCreating(true);
      const res = await fetch('/api/admin/email/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: newAlias, forward: newForward }),
      });
      if (res.ok) {
        showFeedback(true, `Alias ${newAlias}@${DOMAIN} created`);
        setNewAlias('');
        setNewForward('');
        setShowCreate(false);
        await fetchAliases();
      } else {
        const data = (await res.json()) as { message?: string };
        showFeedback(false, data.message || 'Failed to create alias');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to create alias');
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async (alias: Alias) => {
    if (!editForward) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/admin/email/aliases/${alias.alias}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forward: editForward }),
      });
      if (res.ok) {
        showFeedback(true, `Alias ${alias.alias}@${DOMAIN} updated`);
        setEditingId(null);
        await fetchAliases();
      } else {
        const data = (await res.json()) as { message?: string };
        showFeedback(false, data.message || 'Failed to update alias');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to update alias');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (alias: Alias) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/email/aliases/${alias.alias}`, { method: 'DELETE' });
      if (res.ok) {
        showFeedback(true, `Alias ${alias.alias}@${DOMAIN} deleted`);
        setDeletingId(null);
        await fetchAliases();
      } else {
        const data = (await res.json()) as { message?: string };
        showFeedback(false, data.message || 'Failed to delete alias');
      }
    } catch (err) {
      showFeedback(false, err instanceof Error ? err.message : 'Failed to delete alias');
    } finally {
      setDeleting(false);
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const filteredAliases = aliases.filter((a) => {
    if (!searchQuery || activeTab !== 'aliases') return true;
    const q = searchQuery.toLowerCase();
    return a.alias.toLowerCase().includes(q) || a.forward.toLowerCase().includes(q);
  });

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const formatISODate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const getLogStatusColor = (status: string) => {
    if (status === 'DELIVERED' || status === 'delivered') return 'text-green-500 bg-green-500/10';
    if (status === 'BOUNCED' || status === 'bounced') return 'text-red-500 bg-red-500/10';
    if (status === 'QUEUED' || status === 'queued') return 'text-yellow-500 bg-yellow-500/10';
    return 'text-text-tertiary bg-background-tertiary';
  };

  const pendingDrafts = drafts.filter((d) => d.status === 'pending');
  const sentDrafts = drafts.filter((d) => d.status === 'sent');

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Mail className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Email Management</h1>
              <p className="text-sm text-text-secondary">
                Manage emails for <span className="text-accent-primary font-medium">{DOMAIN}</span> &mdash; AI-powered classification &amp; response
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="https://app.improvmx.com"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors"
            >
              ImprovMX Dashboard
            </a>
          </div>
        </div>

        {/* Feedback banner */}
        <AnimatePresence>
          {feedback && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
                feedback.ok
                  ? 'bg-green-500/10 border border-green-500/30'
                  : 'bg-red-500/10 border border-red-500/30'
              }`}
            >
              {feedback.ok ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              )}
              <span className={feedback.ok ? 'text-green-500' : 'text-red-500'}>
                {feedback.msg}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tab Navigation */}
        <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
          {([
            { key: 'inbox' as const, label: 'Inbox', icon: Inbox, count: inboxCounts.unread },
            { key: 'drafts' as const, label: 'Drafts', icon: FileText, count: pendingDrafts.length },
            { key: 'sent' as const, label: 'Sent', icon: Send, count: null },
            { key: 'aliases' as const, label: 'Aliases', icon: Mail, count: aliases.length || null },
            { key: 'logs' as const, label: 'Logs', icon: Clock, count: null },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 text-xs rounded-full ${
                  tab.key === 'inbox' && inboxCounts.unread > 0
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-accent-primary/20 text-accent-primary'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* ── INBOX TAB ─────────────────────────────────────────────── */}
          {activeTab === 'inbox' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    value={inboxFilter}
                    onChange={(e) => setInboxFilter(e.target.value)}
                    className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="all">All ({inboxCounts.total})</option>
                    <option value="unread">Unread ({inboxCounts.unread})</option>
                    <option value="read">Read ({inboxCounts.read})</option>
                    <option value="replied">Replied ({inboxCounts.replied})</option>
                    <option value="archived">Archived ({inboxCounts.archived})</option>
                    <option value="spam">Spam ({inboxCounts.spam})</option>
                  </select>
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="all">All Types</option>
                    <option value="support_request">Support</option>
                    <option value="bug_report">Bug Report</option>
                    <option value="feature_request">Feature Request</option>
                    <option value="billing_inquiry">Billing</option>
                    <option value="partnership">Partnership</option>
                    <option value="spam">Spam</option>
                    <option value="personal">Personal</option>
                  </select>
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="all">All Priority</option>
                    <option value="P0">P0 Critical</option>
                    <option value="P1">P1 Important</option>
                    <option value="P2">P2 Normal</option>
                    <option value="P3">P3 Low</option>
                  </select>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                    <input
                      type="text"
                      placeholder="Search emails..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 pr-4 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary w-64"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchInbox}
                    disabled={inboxLoading}
                    className="p-2 text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                    title="Refresh"
                  >
                    <RefreshCw className={`w-4 h-4 ${inboxLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={handleIngest}
                    disabled={ingesting}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    title="Fetch new emails from Gmail"
                  >
                    {ingesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Fetch Emails
                  </button>
                </div>
              </div>

              {/* Selected message detail */}
              {selectedMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="bg-background-secondary border border-border rounded-lg overflow-hidden"
                >
                  <div className="p-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setSelectedMessage(null)}
                        className="p-1 text-text-secondary hover:text-text-primary rounded"
                      >
                        <ArrowRight className="w-4 h-4 rotate-180" />
                      </button>
                      <h3 className="text-sm font-semibold text-text-primary">{selectedMessage.subject}</h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGenerateDraft(selectedMessage.id)}
                        disabled={generatingDraft === selectedMessage.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                      >
                        {generatingDraft === selectedMessage.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                        Draft Reply
                      </button>
                      <button
                        onClick={() => handleStatusUpdate([selectedMessage.id], 'archived')}
                        className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-background-tertiary rounded"
                        title="Archive"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMessage(selectedMessage.id)}
                        className="p-1.5 text-text-tertiary hover:text-red-500 hover:bg-red-500/10 rounded"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-4 text-xs text-text-secondary">
                      <span>From: <span className="text-text-primary">{selectedMessage.fromName || selectedMessage.from}</span></span>
                      <span>To: <span className="text-text-primary">{selectedMessage.to}</span></span>
                      <span>{formatISODate(selectedMessage.receivedAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedMessage.classification && classificationConfig[selectedMessage.classification] && (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${classificationConfig[selectedMessage.classification].color}`}>
                          {classificationConfig[selectedMessage.classification].label}
                        </span>
                      )}
                      {selectedMessage.priority && priorityConfig[selectedMessage.priority] && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${priorityConfig[selectedMessage.priority].color}`}>
                          {selectedMessage.priority}
                        </span>
                      )}
                      {selectedMessage.sentiment && sentimentConfig[selectedMessage.sentiment] && (
                        <span className={`text-xs ${sentimentConfig[selectedMessage.sentiment].color}`}>
                          {sentimentConfig[selectedMessage.sentiment].label}
                        </span>
                      )}
                      {selectedMessage.linkedIssueId && (
                        <span className="px-2 py-0.5 text-xs bg-red-500/10 text-red-400 rounded-full">Issue linked</span>
                      )}
                      {selectedMessage.linkedIdeaId && (
                        <span className="px-2 py-0.5 text-xs bg-purple-500/10 text-purple-400 rounded-full">Idea linked</span>
                      )}
                    </div>
                    <div className="bg-background-primary border border-border rounded-lg p-4 text-sm text-text-primary whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {selectedMessage.bodyText}
                    </div>
                    {selectedMessage.actionItems && (() => {
                      try {
                        const items = JSON.parse(selectedMessage.actionItems) as string[];
                        if (items.length > 0) {
                          return (
                            <div className="text-xs text-text-secondary">
                              <span className="font-medium">Action items: </span>
                              {items.join(' \u00B7 ')}
                            </div>
                          );
                        }
                        return null;
                      } catch {
                        return null;
                      }
                    })()}
                  </div>
                </motion.div>
              )}

              {/* Messages list */}
              {inboxLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-20">
                  <Inbox className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-secondary">No emails found</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Click &quot;Fetch Emails&quot; to poll Gmail for new messages
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {messages.map((msg) => {
                    const cls = msg.classification ? classificationConfig[msg.classification] : null;
                    const pri = msg.priority ? priorityConfig[msg.priority] : null;
                    const isUnread = msg.status === 'unread';
                    return (
                      <button
                        key={msg.id}
                        onClick={() => setSelectedMessage(msg)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          selectedMessage?.id === msg.id
                            ? 'bg-accent-primary/10 border-accent-primary/30'
                            : isUnread
                              ? 'bg-background-secondary border-border hover:border-border-hover'
                              : 'bg-background-primary border-border/50 hover:border-border'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isUnread ? 'bg-accent-primary' : 'bg-transparent'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-sm truncate ${isUnread ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                                {msg.fromName || msg.from}
                              </span>
                              <span className="text-xs text-text-tertiary flex-shrink-0">
                                {formatISODate(msg.receivedAt)}
                              </span>
                            </div>
                            <p className={`text-sm truncate mt-0.5 ${isUnread ? 'text-text-primary' : 'text-text-secondary'}`}>
                              {msg.subject}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {cls && (
                                <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full ${cls.color}`}>
                                  {cls.label}
                                </span>
                              )}
                              {pri && (
                                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full border ${pri.color}`}>
                                  {msg.priority}
                                </span>
                              )}
                              <span className="text-[10px] text-text-tertiary">{msg.to}</span>
                              {msg.status === 'replied' && (
                                <span className="text-[10px] text-green-400">replied</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── DRAFTS TAB ────────────────────────────────────────────── */}
          {activeTab === 'drafts' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  LLM-generated response drafts awaiting review ({pendingDrafts.length} pending)
                </p>
                <button
                  onClick={fetchDrafts}
                  disabled={draftsLoading}
                  className="p-2 text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${draftsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {draftsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : pendingDrafts.length === 0 ? (
                <div className="text-center py-20">
                  <FileText className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-secondary">No pending drafts</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    Open an email in the Inbox and click &quot;Draft Reply&quot; to generate one
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="p-4 bg-background-secondary border border-border rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            Re: {draft.emailMessage?.subject ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            To: {draft.emailMessage?.from ?? 'Unknown'} &middot; Generated {formatISODate(draft.createdAt)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {draft.emailMessage?.classification && classificationConfig[draft.emailMessage.classification] && (
                              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${classificationConfig[draft.emailMessage.classification].color}`}>
                                {classificationConfig[draft.emailMessage.classification].label}
                              </span>
                            )}
                            <span className="text-[10px] text-text-tertiary">Model: {draft.model}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSendDraft(draft.id)}
                            disabled={sendingDraft === draft.id}
                            className="flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                          >
                            {sendingDraft === draft.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                            Send
                          </button>
                          <button
                            onClick={() => handleDiscardDraft(draft.id)}
                            className="px-3 py-1.5 text-text-secondary hover:text-red-400 text-xs transition-colors"
                          >
                            Discard
                          </button>
                        </div>
                      </div>
                      <div
                        className="bg-background-primary border border-border rounded-lg p-4 text-sm text-text-primary max-h-60 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.draftBody) }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── SENT TAB ──────────────────────────────────────────────── */}
          {activeTab === 'sent' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  Sent responses ({sentDrafts.length} total)
                </p>
                <button
                  onClick={fetchDrafts}
                  disabled={draftsLoading}
                  className="p-2 text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${draftsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {draftsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : sentDrafts.length === 0 ? (
                <div className="text-center py-20">
                  <Send className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-secondary">No sent responses yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="p-4 bg-background-secondary border border-border rounded-lg"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-sm font-medium text-text-primary">
                            Re: {draft.emailMessage?.subject ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            To: {draft.emailMessage?.from ?? 'Unknown'} &middot; Sent {draft.sentAt ? formatISODate(draft.sentAt) : 'N/A'}
                          </p>
                          <p className="text-xs text-text-tertiary mt-0.5">
                            From: {draft.sentFrom ?? 'support@deepterm.net'}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 text-xs text-green-400 bg-green-500/10 rounded-full">
                          Sent
                        </span>
                      </div>
                      <div
                        className="bg-background-primary border border-border rounded-lg p-4 text-sm text-text-primary max-h-40 overflow-y-auto"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.editedBody || draft.draftBody) }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── ALIASES TAB ───────────────────────────────────────────── */}
          {activeTab === 'aliases' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search aliases..."
                    value={activeTab === 'aliases' ? searchQuery : ''}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAliases}
                    disabled={isLoading}
                    className="p-2 text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Add Alias
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showCreate && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-background-secondary border border-border rounded-lg space-y-3">
                      <h3 className="text-sm font-semibold text-text-primary">New Email Alias</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">Alias</label>
                          <div className="flex items-center">
                            <input
                              type="text"
                              value={newAlias}
                              onChange={(e) => setNewAlias(e.target.value)}
                              placeholder="e.g. sales"
                              className="flex-1 px-3 py-2 bg-background-primary border border-border rounded-l-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                            />
                            <span className="px-3 py-2 bg-background-tertiary border border-l-0 border-border rounded-r-lg text-sm text-text-secondary">
                              @{DOMAIN}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-text-secondary mb-1">Forward to</label>
                          <input
                            type="email"
                            value={newForward}
                            onChange={(e) => setNewForward(e.target.value)}
                            placeholder="destination@example.com"
                            className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleCreate}
                          disabled={creating || !newAlias || !newForward}
                          className="flex items-center gap-2 px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                          Create
                        </button>
                        <button
                          onClick={() => { setShowCreate(false); setNewAlias(''); setNewForward(''); }}
                          className="px-4 py-2 text-text-secondary hover:text-text-primary text-sm transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : filteredAliases.length === 0 ? (
                <div className="text-center py-20">
                  <Mail className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-secondary">
                    {searchQuery ? 'No aliases match your search' : 'No email aliases configured'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredAliases.map((alias) => (
                    <div
                      key={alias.id}
                      className="p-4 bg-background-secondary border border-border rounded-lg hover:border-border-hover transition-colors"
                    >
                      {editingId === alias.id ? (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <span className="text-sm text-text-primary font-medium">
                              {alias.alias === '*' ? '*' : alias.alias}@{DOMAIN}
                            </span>
                            <div className="flex items-center gap-2 mt-2">
                              <ArrowRight className="w-4 h-4 text-text-tertiary flex-shrink-0" />
                              <input
                                type="email"
                                value={editForward}
                                onChange={(e) => setEditForward(e.target.value)}
                                className="flex-1 px-3 py-1.5 bg-background-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleUpdate(alias)}
                              disabled={saving || !editForward}
                              className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : deletingId === alias.id ? (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <span className="text-sm text-red-400">
                              Delete <span className="font-medium">{alias.alias === '*' ? '*' : alias.alias}@{DOMAIN}</span>?
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDelete(alias)}
                              disabled={deleting}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              {deleting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              className="px-3 py-1.5 text-text-secondary hover:text-text-primary text-xs transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-accent-primary/10 rounded-lg">
                              <Mail className="w-4 h-4 text-accent-primary" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-text-primary font-medium">
                                  {alias.alias === '*' ? (
                                    <span className="text-accent-secondary">* (catch-all)</span>
                                  ) : alias.alias}
                                  <span className="text-text-tertiary">@{DOMAIN}</span>
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <ArrowRight className="w-3 h-3 text-text-tertiary" />
                                <span className="text-xs text-text-secondary">{alias.forward}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-text-tertiary">{formatDate(alias.created)}</span>
                            <button
                              onClick={() => { setEditingId(alias.id); setEditForward(alias.forward); }}
                              className="p-1.5 text-text-tertiary hover:text-accent-primary hover:bg-accent-primary/10 rounded-lg transition-colors"
                              title="Edit forwarding address"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setDeletingId(alias.id)}
                              className="p-1.5 text-text-tertiary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                              title="Delete alias"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── LOGS TAB ──────────────────────────────────────────────── */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-text-secondary">
                  Recent email delivery logs from ImprovMX
                </p>
                <button
                  onClick={fetchLogs}
                  disabled={logsLoading}
                  className="p-2 text-text-secondary hover:text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${logsLoading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
                </div>
              ) : logs.length === 0 ? (
                <div className="text-center py-20">
                  <Clock className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                  <p className="text-text-secondary">No email logs yet</p>
                  <p className="text-xs text-text-tertiary mt-1">Logs will appear once emails are received</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {logs.map((log) => {
                    const lastEvent = log.events[log.events.length - 1];
                    const status = lastEvent?.status || 'unknown';
                    return (
                      <div
                        key={log.id}
                        className="p-4 bg-background-secondary border border-border rounded-lg"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getLogStatusColor(status)}`}>
                                {status}
                              </span>
                              <span className="text-xs text-text-tertiary">
                                {formatDate(log.created)}
                              </span>
                            </div>
                            <p className="text-sm text-text-primary font-medium truncate">
                              {log.subject || '(no subject)'}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-text-secondary truncate">
                                {log.sender.address}
                              </span>
                              <ArrowRight className="w-3 h-3 text-text-tertiary flex-shrink-0" />
                              <span className="text-xs text-text-secondary truncate">
                                {log.recipient}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
