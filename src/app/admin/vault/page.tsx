'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Shield,
  Users,
  Key,
  Trash2,
  Search,
  RefreshCw,
  FileText,
  Smartphone,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

/* ---------- types ---------- */

interface VaultUser {
  id: string;
  email: string;
  emailVerified: boolean;
  kdfType: number;
  kdfIterations: number;
  createdAt: string;
  updatedAt: string;
  webUserId: string | null;
  appleProductId: string | null;
  appleExpiresDate: string | null;
  _count: {
    zkVaults: number;
    zkVaultItems: number;
    devices: number;
    refreshTokens: number;
  };
}

interface UserStats {
  totalUsers: number;
  totalVaults: number;
  totalItems: number;
  deletedItems: number;
}

interface AuditLog {
  id: string;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  deviceInfo: string | null;
  timestamp: string;
  user: { email: string } | null;
}

interface EventTypeCount {
  eventType: string;
  _count: number;
}

type Tab = 'users' | 'audit';

/* ---------- helpers ---------- */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

/* ---------- component ---------- */

export default function VaultManagementPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Users tab state
  const [users, setUsers] = useState<VaultUser[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);

  // Audit tab state
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [eventTypes, setEventTypes] = useState<EventTypeCount[]>([]);
  const [eventFilter, setEventFilter] = useState('');

  const { setPageContext } = useAdminAI();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ tab });
      if (tab === 'audit' && eventFilter) params.set('eventType', eventFilter);

      const res = await fetch(`/api/admin/vault?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      if (tab === 'users') {
        setUsers(data.users || []);
        setStats(data.stats || null);
      } else {
        setLogs(data.logs || []);
        setEventTypes(data.eventTypes || []);
      }
    } catch (err) {
      console.error('Vault fetch error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [tab, eventFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setPageContext({
      page: 'Vault Management',
      summary: 'ZK vault user overview and audit logs — zero-knowledge, no plaintext data shown',
      data: stats ? {
        totalUsers: stats.totalUsers,
        totalVaults: stats.totalVaults,
        totalItems: stats.totalItems,
        deletedItems: stats.deletedItems,
      } : { loading: true },
    });
    return () => setPageContext(null);
  }, [stats, setPageContext]);

  const filteredUsers = search
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()))
    : users;

  const filteredLogs = search
    ? logs.filter(l =>
        l.eventType.toLowerCase().includes(search.toLowerCase()) ||
        (l.user?.email || '').toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">
              Vault Management
            </h1>
            <p className="text-text-secondary">
              Zero-knowledge vault users and audit trail
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stat cards (users tab only) */}
        {tab === 'users' && stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Vault Users', value: stats.totalUsers, icon: Users, color: 'text-accent-primary', bg: 'bg-accent-primary/10' },
              { label: 'Vaults', value: stats.totalVaults, icon: Shield, color: 'text-green-500', bg: 'bg-green-500/10' },
              { label: 'Vault Items', value: stats.totalItems, icon: Key, color: 'text-amber-500', bg: 'bg-amber-500/10' },
              { label: 'Soft-Deleted', value: stats.deletedItems, icon: Trash2, color: 'text-red-400', bg: 'bg-red-500/10' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <Card key={s.label}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-text-tertiary">{s.label}</p>
                      <p className="text-xl font-bold text-text-primary">{s.value}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${s.bg}`}>
                      <Icon className={`w-5 h-5 ${s.color}`} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Tabs + Search */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-1 bg-background-tertiary rounded-lg p-1">
            {(['users', 'audit'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSearch(''); }}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  tab === t
                    ? 'bg-accent-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {t === 'users' ? 'Vault Users' : 'Audit Log'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {tab === 'audit' && (
              <div className="relative">
                <select
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  className="appearance-none bg-background-tertiary text-text-primary text-sm rounded-lg pl-3 pr-8 py-2 border border-border focus:outline-none focus:border-accent-primary"
                >
                  <option value="">All events</option>
                  {eventTypes.map((et) => (
                    <option key={et.eventType} value={et.eventType}>
                      {et.eventType} ({et._count})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-text-tertiary absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder={tab === 'users' ? 'Search email...' : 'Search events...'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 bg-background-tertiary text-text-primary rounded-lg border border-border focus:outline-none focus:border-accent-primary text-sm w-56"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
          </div>
        ) : tab === 'users' ? (
          /* ---- Users table ---- */
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 text-text-tertiary font-medium">Email</th>
                    <th className="pb-3 text-text-tertiary font-medium text-center">Vaults</th>
                    <th className="pb-3 text-text-tertiary font-medium text-center">Items</th>
                    <th className="pb-3 text-text-tertiary font-medium text-center">Devices</th>
                    <th className="pb-3 text-text-tertiary font-medium">KDF</th>
                    <th className="pb-3 text-text-tertiary font-medium">Linked</th>
                    <th className="pb-3 text-text-tertiary font-medium">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-background-tertiary/50">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-text-primary font-medium">{user.email}</span>
                          {user.emailVerified && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">verified</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-center text-text-primary">{user._count.zkVaults}</td>
                      <td className="py-3 text-center text-text-primary">{user._count.zkVaultItems}</td>
                      <td className="py-3 text-center">
                        <span className="flex items-center justify-center gap-1 text-text-primary">
                          <Smartphone className="w-3 h-3 text-text-tertiary" />
                          {user._count.devices}
                        </span>
                      </td>
                      <td className="py-3 text-text-tertiary text-xs">
                        {user.kdfType === 0 ? 'PBKDF2' : 'Argon2id'} · {(user.kdfIterations / 1000).toFixed(0)}k
                      </td>
                      <td className="py-3">
                        {user.webUserId ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-accent-primary/20 text-accent-primary">Web</span>
                        ) : null}
                        {user.appleProductId ? (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 ml-1">IAP</span>
                        ) : null}
                      </td>
                      <td className="py-3 text-text-tertiary text-xs">{timeAgo(user.createdAt)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-text-secondary">
                        {search ? 'No users match your search' : 'No vault users'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* ---- Audit log table ---- */
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 text-text-tertiary font-medium">Event</th>
                    <th className="pb-3 text-text-tertiary font-medium">User</th>
                    <th className="pb-3 text-text-tertiary font-medium">Target</th>
                    <th className="pb-3 text-text-tertiary font-medium">IP</th>
                    <th className="pb-3 text-text-tertiary font-medium">Device</th>
                    <th className="pb-3 text-text-tertiary font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredLogs.length > 0 ? filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-background-tertiary/50">
                      <td className="py-3">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          log.eventType.includes('login') ? 'bg-green-500/20 text-green-400' :
                          log.eventType.includes('fail') || log.eventType.includes('error') ? 'bg-red-500/20 text-red-400' :
                          log.eventType.includes('delete') ? 'bg-amber-500/20 text-amber-400' :
                          'bg-white/10 text-text-secondary'
                        }`}>
                          {log.eventType}
                        </span>
                      </td>
                      <td className="py-3 text-text-primary text-xs">{log.user?.email || '—'}</td>
                      <td className="py-3 text-text-tertiary text-xs">
                        {log.targetType ? `${log.targetType}` : '—'}
                      </td>
                      <td className="py-3 text-text-tertiary text-xs font-mono">{log.ipAddress || '—'}</td>
                      <td className="py-3 text-text-tertiary text-xs truncate max-w-[120px]">{log.deviceInfo || '—'}</td>
                      <td className="py-3 text-text-tertiary text-xs">{timeAgo(log.timestamp)}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-secondary">
                        {search || eventFilter ? 'No matching audit logs' : 'No audit logs'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
