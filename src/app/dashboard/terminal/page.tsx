'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import {
  Terminal as TerminalIcon,
  Users,
  Eye,
  Edit3,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Circle,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for SharedTerminal (xterm.js needs browser APIs)
const SharedTerminal = dynamic(
  () => import('@/components/terminal/SharedTerminal').then(mod => ({ default: mod.SharedTerminal })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-96"><Loader2 className="w-8 h-8 animate-spin text-accent-primary" /></div> }
);

interface SharedSession {
  id: string;
  ownerId: string;
  ownerEmail: string;
  sessionName: string;
  participants: {
    userId: string;
    email: string;
    canWrite: boolean;
    status: string;
    joinedAt: string | null;
  }[];
  createdAt: string;
}

interface WsAuth {
  token: string;
  userId: string;
  orgIds: string[];
}

export default function TerminalPage() {
  const { data: session } = useSession();
  const [sessions, setSessions] = useState<SharedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [wsAuth, setWsAuth] = useState<WsAuth | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState('');

  // Stable callback for SharedTerminal disconnect
  const handleDisconnect = useCallback(() => {
    // Could show reconnect UI
  }, []);

  // Fetch organizations the user belongs to
  const fetchOrgs = useCallback(async () => {
    try {
      // Get WS token which includes orgIds
      const res = await fetch('/api/terminal/ws-token', { method: 'POST' });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      if (data) {
        setWsAuth(data);
        // Fetch org details for each orgId
        const orgDetails: { id: string; name: string }[] = [];
        for (const orgId of data.orgIds || []) {
          try {
            // We need to fetch org info — use a simple approach
            orgDetails.push({ id: orgId, name: orgId.substring(0, 8) + '...' });
          } catch {
            // skip
          }
        }
        setOrgs(orgDetails);
        if (orgDetails.length > 0) {
          setSelectedOrgId(prev => prev ?? orgDetails[0].id);
        } else {
          setLoading(false);
        }
      }
    } catch (err) {
      console.error('Failed to get WS auth:', err);
      setError('Failed to authenticate for shared terminals');
      setLoading(false);
    }
  }, []);

  // Fetch active shared sessions for the selected org
  const fetchSessions = useCallback(async () => {
    if (!selectedOrgId || !wsAuth) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/zk/terminal/share?orgId=${selectedOrgId}`, {
        headers: {
          'Authorization': `Bearer ${wsAuth.token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data || []);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId, wsAuth]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (selectedOrgId && wsAuth) {
      fetchSessions();
    }
  }, [selectedOrgId, wsAuth, fetchSessions]);

  // Determine WebSocket URL
  const getWsUrl = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}/ws/collab`;
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const isOwner = activeSession?.ownerId === wsAuth?.userId;
  const myParticipant = activeSession?.participants.find(p => p.userId === wsAuth?.userId);
  const canWrite = isOwner || (myParticipant?.canWrite ?? false);

  // If viewing an active terminal session
  if (activeSessionId && wsAuth) {
    return (
      <div className="h-[calc(100vh-4rem)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActiveSessionId(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <h2 className="text-lg font-semibold text-text-primary">
              {activeSession?.sessionName || 'Shared Terminal'}
            </h2>
            <Badge variant={isOwner ? 'primary' : 'default'}>
              {isOwner ? 'Owner' : 'Participant'}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">
              {activeSession?.participants.filter(p => p.status === 'joined').length || 0} participants
            </span>
          </div>
        </div>

        <div className="h-[calc(100%-3rem)] rounded-lg border border-border overflow-hidden">
          <SharedTerminal
            sessionId={activeSessionId}
            wsToken={wsAuth.token}
            wsUrl={getWsUrl()}
            canWrite={canWrite}
            isOwner={isOwner}
            userId={wsAuth.userId}
            onDisconnect={handleDisconnect}
          />
        </div>
      </div>
    );
  }

  // Session list view
  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Shared Terminals</h1>
            <p className="text-text-secondary">
              View and join shared terminal sessions from your organization
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchSessions()}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <Card className="mb-6 border-red-500/30">
            <p className="text-red-400">{error}</p>
          </Card>
        )}

        {/* Org selector (if user is in multiple orgs) */}
        {orgs.length > 1 && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Organization
            </label>
            <select
              value={selectedOrgId || ''}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="bg-background-tertiary border border-border rounded-lg px-4 py-2 text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {orgs.map(org => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <TerminalIcon className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No Active Shared Sessions
              </h3>
              <p className="text-text-secondary max-w-md mx-auto">
                Shared terminal sessions are started from the DeepTerm app. When a team member shares their terminal,
                it will appear here for you to view or collaborate on.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {sessions.map((s) => {
              const amOwner = s.ownerId === wsAuth?.userId;
              const myPart = s.participants.find(p => p.userId === wsAuth?.userId);
              const myCanWrite = amOwner || (myPart?.canWrite ?? false);
              const activeParticipants = s.participants.filter(p => p.status === 'joined');

              return (
                <Card
                  key={s.id}
                  className="hover:border-accent-primary/50 transition-colors cursor-pointer"
                  onClick={() => setActiveSessionId(s.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-accent-primary/20 rounded-lg flex items-center justify-center">
                        <TerminalIcon className="w-6 h-6 text-accent-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-text-primary">
                          {s.sessionName || 'Unnamed Session'}
                        </h3>
                        <p className="text-sm text-text-secondary">
                          Shared by {s.ownerEmail}
                        </p>
                        <p className="text-xs text-text-tertiary mt-1">
                          Started {new Date(s.createdAt).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Participant count */}
                      <div className="flex items-center gap-1.5 text-text-secondary">
                        <Users className="w-4 h-4" />
                        <span className="text-sm">{activeParticipants.length}</span>
                      </div>

                      {/* Access mode indicator */}
                      <Badge variant={myCanWrite ? 'success' : 'warning'}>
                        {myCanWrite ? (
                          <span className="flex items-center gap-1">
                            <Edit3 className="w-3 h-3" />
                            Read/Write
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Read-Only
                          </span>
                        )}
                      </Badge>

                      {/* Active indicator */}
                      <Circle className="w-3 h-3 fill-green-400 text-green-400" />

                      <Button variant="primary" size="sm">
                        Join
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
