'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge, Button } from '@/components/ui';
import {
  ArrowLeft,
  User,
  Shield,
  Mail,
  Calendar,
  Key,
  Smartphone,
  Lightbulb,
  Bug,
  ThumbsUp,
  Loader2,
  CreditCard,
  Lock,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  plan: string;
  twoFactorEnabled: boolean;
  subscriptionSource: string | null;
  subscriptionExpiresAt: string | null;
  team: { id: string; name: string; plan: string } | null;
  sessions: Array<{ id: string; device: string | null; lastActive: string }>;
  ideas: Array<{ id: string; title: string; status: string; createdAt: string }>;
  issues: Array<{ id: string; title: string; status: string; area: string; createdAt: string }>;
  stats: { ideas: number; votes: number; issues: number; passkeys: number; sessions: number };
  zkUser: {
    id: string;
    email: string;
    emailVerified: boolean;
    createdAt: string;
    _count: { zkVaults: number; zkVaultItems: number; devices: number };
  } | null;
  zkItemTypeCounts: {
    credentials: number;
    managedKeys: number;
    identities: number;
    hostGroups: number;
    unknown: number;
  } | null;
  createdAt: string;
  updatedAt: string;
}

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

export default function UserDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await fetch(`/api/admin/users/${id}`);
        if (res.ok) setUser(await res.json());
      } catch (err) {
        console.error('Failed to fetch user:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchUser();
  }, [id]);

  useEffect(() => {
    if (user) {
      setPageContext({
        page: `User Detail — ${user.name}`,
        summary: `${user.email}, ${user.role}, ${user.plan} plan`,
        data: {
          userId: user.id,
          email: user.email,
          role: user.role,
          plan: user.plan,
          team: 'none',
          ideas: user.stats.ideas,
          issues: user.stats.issues,
          hasVault: !!user.zkUser,
          twoFactor: user.twoFactorEnabled,
        },
      });
    }
    return () => setPageContext(null);
  }, [user, setPageContext]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">User not found</p>
        <Link href="/admin/users" className="text-accent-primary hover:underline mt-2 inline-block">
          ← Back to Users
        </Link>
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/admin/users" className="p-2 rounded-lg bg-background-tertiary hover:bg-background-tertiary/80 transition-colors">
            <ArrowLeft className="w-5 h-5 text-text-secondary" />
          </Link>
          <div className="flex items-center gap-4 flex-1">
            <div className="w-14 h-14 bg-accent-primary/20 rounded-full flex items-center justify-center">
              <span className="text-xl font-bold text-accent-primary">{(user.name || user.email).charAt(0)}</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">{user.name || user.email}</h1>
              <p className="text-text-secondary">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={user.role === 'admin' ? 'primary' : 'secondary'}>{user.role}</Badge>
            <Badge variant={user.plan === 'pro' ? 'primary' : 'secondary'}>{user.plan}</Badge>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { label: 'Ideas', value: user.stats.ideas, icon: Lightbulb, color: 'text-amber-400' },
            { label: 'Votes', value: user.stats.votes, icon: ThumbsUp, color: 'text-blue-400' },
            { label: 'Issues', value: user.stats.issues, icon: Bug, color: 'text-red-400' },
            { label: 'Passkeys', value: user.stats.passkeys, icon: Key, color: 'text-green-400' },
            { label: 'Sessions', value: user.stats.sessions, icon: Smartphone, color: 'text-purple-400' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.label}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${s.color}`} />
                  <span className="text-xs text-text-tertiary">{s.label}</span>
                </div>
                <p className="text-xl font-bold text-text-primary mt-1">{s.value}</p>
              </Card>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left: Account info + Team + Subscription */}
          <div className="space-y-6">
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-4">Account Info</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Email</span>
                  <span className="text-text-primary">{user.email}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary flex items-center gap-2"><Shield className="w-3.5 h-3.5" /> Role</span>
                  <span className="text-text-primary capitalize">{user.role}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary flex items-center gap-2"><Lock className="w-3.5 h-3.5" /> 2FA</span>
                  <span className={user.twoFactorEnabled ? 'text-green-400' : 'text-text-tertiary'}>{user.twoFactorEnabled ? 'Enabled' : 'Off'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Joined</span>
                  <span className="text-text-primary">{new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-tertiary flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> Updated</span>
                  <span className="text-text-primary">{timeAgo(user.updatedAt)}</span>
                </div>
              </div>
            </Card>

            {/* Subscription */}
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-green-400" /> Subscription
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-tertiary">Plan</span>
                  <span className="text-text-primary capitalize">{user.plan}</span>
                </div>
                {user.subscriptionSource && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Source</span>
                    <span className="text-text-primary">{user.subscriptionSource}</span>
                  </div>
                )}
                {user.subscriptionExpiresAt && (
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Expires</span>
                    <span className="text-text-primary">{new Date(user.subscriptionExpiresAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </Card>

            {/* Linked ZK Vault */}
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-3 flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent-primary" /> Vault Account
              </h2>
              {user.zkUser ? (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Email</span>
                    <span className="text-text-primary">{user.zkUser.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Verified</span>
                    <span className={user.zkUser.emailVerified ? 'text-green-400' : 'text-text-tertiary'}>{user.zkUser.emailVerified ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Vaults</span>
                    <span className="text-text-primary">{user.zkUser._count.zkVaults}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Items</span>
                    <span className="text-text-primary">{user.zkUser._count.zkVaultItems}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Devices</span>
                    <span className="text-text-primary">{user.zkUser._count.devices}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-tertiary">Created</span>
                    <span className="text-text-primary">{timeAgo(user.zkUser.createdAt)}</span>
                  </div>
                  {user.zkItemTypeCounts && (
                    <div className="mt-3 pt-3 border-t border-border">
                      <p className="text-xs text-text-tertiary mb-2">Items by Type</p>
                      <div className="grid grid-cols-2 gap-1 text-xs">
                        <span className="text-text-tertiary">Credentials</span>
                        <span className="text-text-primary text-right">{user.zkItemTypeCounts.credentials}</span>
                        <span className="text-text-tertiary">Managed Keys</span>
                        <span className="text-text-primary text-right">{user.zkItemTypeCounts.managedKeys}</span>
                        <span className="text-text-tertiary">Identities</span>
                        <span className="text-text-primary text-right">{user.zkItemTypeCounts.identities}</span>
                        <span className="text-text-tertiary">Host Groups</span>
                        <span className="text-text-primary text-right">{user.zkItemTypeCounts.hostGroups}</span>
                        {user.zkItemTypeCounts.unknown > 0 && (
                          <>
                            <span className="text-text-tertiary">Unknown</span>
                            <span className="text-text-primary text-right">{user.zkItemTypeCounts.unknown}</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-text-tertiary">No linked vault account</p>
              )}
            </Card>
          </div>

          {/* Right: Ideas + Issues + Sessions */}
          <div className="space-y-6">
            {/* Ideas */}
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-amber-400" /> Ideas ({user.stats.ideas})
              </h2>
              <div className="space-y-2">
                {user.ideas.length > 0 ? user.ideas.map((idea) => (
                  <div key={idea.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                    <span className="text-text-primary truncate">{idea.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        idea.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                        idea.status === 'consideration' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-white/10 text-text-tertiary'
                      }`}>{idea.status}</span>
                      <span className="text-xs text-text-tertiary">{timeAgo(idea.createdAt)}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-text-tertiary">No ideas submitted</p>
                )}
              </div>
            </Card>

            {/* Issues */}
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Bug className="w-5 h-5 text-red-400" /> Issues ({user.stats.issues})
              </h2>
              <div className="space-y-2">
                {user.issues.length > 0 ? user.issues.map((issue) => (
                  <div key={issue.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                    <span className="text-text-primary truncate">{issue.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      <span className="text-xs text-text-tertiary">{issue.area}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        issue.status === 'open' ? 'bg-red-500/20 text-red-400' :
                        issue.status === 'resolved' ? 'bg-green-500/20 text-green-400' :
                        'bg-white/10 text-text-tertiary'
                      }`}>{issue.status}</span>
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-text-tertiary">No issues reported</p>
                )}
              </div>
            </Card>

            {/* Sessions */}
            <Card>
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-purple-400" /> Sessions ({user.stats.sessions})
              </h2>
              <div className="space-y-2">
                {user.sessions.length > 0 ? user.sessions.map((session) => (
                  <div key={session.id} className="flex items-center justify-between p-2 rounded bg-background-tertiary text-sm">
                    <span className="text-text-primary truncate">{session.device || 'Unknown device'}</span>
                    <span className="text-xs text-text-tertiary flex-shrink-0 ml-2">{timeAgo(session.lastActive)}</span>
                  </div>
                )) : (
                  <p className="text-sm text-text-tertiary">No active sessions</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
