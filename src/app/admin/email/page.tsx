'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

type TabKey = 'aliases' | 'logs';

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminEmailPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('aliases');
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [newAlias, setNewAlias] = useState('');
  const [newForward, setNewForward] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit form
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

  // ── Data Fetching ────────────────────────────────────────────────────────

  const fetchAliases = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/email/aliases');
      if (res.ok) {
        const data = await res.json() as { aliases: Alias[] };
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
        const data = await res.json() as { logs: LogEntry[] };
        setLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAliases();
  }, [fetchAliases]);

  useEffect(() => {
    if (activeTab === 'logs' && logs.length === 0) {
      fetchLogs();
    }
  }, [activeTab, logs.length, fetchLogs]);

  // ── Actions ──────────────────────────────────────────────────────────────

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
        setFeedback({ ok: true, msg: `Alias ${newAlias}@${DOMAIN} created` });
        setNewAlias('');
        setNewForward('');
        setShowCreate(false);
        await fetchAliases();
      } else {
        const data = await res.json() as { message?: string };
        setFeedback({ ok: false, msg: data.message || 'Failed to create alias' });
      }
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed to create alias' });
    } finally {
      setCreating(false);
      setTimeout(() => setFeedback(null), 5000);
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
        setFeedback({ ok: true, msg: `Alias ${alias.alias}@${DOMAIN} updated` });
        setEditingId(null);
        await fetchAliases();
      } else {
        const data = await res.json() as { message?: string };
        setFeedback({ ok: false, msg: data.message || 'Failed to update alias' });
      }
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed to update alias' });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  const handleDelete = async (alias: Alias) => {
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/email/aliases/${alias.alias}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setFeedback({ ok: true, msg: `Alias ${alias.alias}@${DOMAIN} deleted` });
        setDeletingId(null);
        await fetchAliases();
      } else {
        const data = await res.json() as { message?: string };
        setFeedback({ ok: false, msg: data.message || 'Failed to delete alias' });
      }
    } catch (err) {
      setFeedback({ ok: false, msg: err instanceof Error ? err.message : 'Failed to delete alias' });
    } finally {
      setDeleting(false);
      setTimeout(() => setFeedback(null), 5000);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────

  const filteredAliases = aliases.filter((a) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.alias.toLowerCase().includes(q) ||
      a.forward.toLowerCase().includes(q)
    );
  });

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusColor = (status: string) => {
    if (status === 'DELIVERED' || status === 'delivered') return 'text-green-500 bg-green-500/10';
    if (status === 'BOUNCED' || status === 'bounced') return 'text-red-500 bg-red-500/10';
    if (status === 'QUEUED' || status === 'queued') return 'text-yellow-500 bg-yellow-500/10';
    return 'text-text-tertiary bg-background-tertiary';
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background-primary">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Mail className="w-6 h-6 text-accent-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Email Management</h1>
              <p className="text-sm text-text-secondary">
                Manage email aliases for <span className="text-accent-primary font-medium">{DOMAIN}</span> via ImprovMX
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
        <div className="flex gap-1 mb-6 border-b border-border">
          {([
            { key: 'aliases' as const, label: 'Aliases', icon: Mail },
            { key: 'logs' as const, label: 'Logs', icon: Clock },
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
              {tab.key === 'aliases' && aliases.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-accent-primary/20 text-accent-primary rounded-full">
                  {aliases.length}
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
          {activeTab === 'aliases' && (
            <div className="space-y-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                  <input
                    type="text"
                    placeholder="Search aliases..."
                    value={searchQuery}
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

              {/* Create form */}
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
                          {creating ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4" />
                          )}
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

              {/* Aliases list */}
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
                        /* Edit mode */
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
                        /* Delete confirmation */
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
                        /* Normal view */
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
                                  ) : (
                                    alias.alias
                                  )}
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
                            <span className="text-xs text-text-tertiary">
                              {formatDate(alias.created)}
                            </span>
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

          {activeTab === 'logs' && (
            <div className="space-y-4">
              {/* Toolbar */}
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
                              <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
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
