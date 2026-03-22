'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Users, Terminal, Mic, Bell, Loader2 } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { PresenceIndicator } from '@/components/collaboration/PresenceIndicator';
import { TeamChat } from '@/components/collaboration/TeamChat';
import { OrgManagement } from '@/components/collaboration/OrgManagement';
import { TerminalSharing } from '@/components/collaboration/TerminalSharing';
import { AudioCallUI } from '@/components/collaboration/AudioCallUI';
import {
  NotificationToast,
  useSessionNotifications,
} from '@/components/collaboration/NotificationToast';

type TabId = 'overview' | 'chat' | 'terminal' | 'audio' | 'manage';

export default function CollaborationPage() {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [wsConnected, setWsConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const { notifications, dismiss } = useSessionNotifications(wsRef, wsConnected);

  // Fetch current user & org info
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/zk/organizations');
        if (res.ok) {
          const data = await res.json();
          const orgs = Array.isArray(data) ? data : (data.organizations || []);
          if (orgs.length > 0) {
            setSelectedOrgId(orgs[0].id);
          }
        }
        // Get current user ID from session
        const sessionRes = await fetch('/api/auth/session');
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          setCurrentUserId(session?.user?.id || '');
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Connect WebSocket when org is selected
  useEffect(() => {
    if (!selectedOrgId) return;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    async function connect() {
      if (cancelled) return;
      try {
        // Get ws-token
        const tokenRes = await fetch('/api/terminal/ws-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orgId: selectedOrgId }),
        });
        if (!tokenRes.ok || cancelled) return;
        const { token } = await tokenRes.json();

        if (cancelled) return;
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/collab?token=${token}`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (cancelled) { ws?.close(); return; }
          setWsConnected(true);
          wsRef.current = ws;
        };

        ws.onclose = () => {
          setWsConnected(false);
          wsRef.current = null;
          if (!cancelled) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };

        ws.onerror = () => {
          ws?.close();
        };
      } catch {
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 5000);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [selectedOrgId]);

  const handleNotificationAccept = useCallback((notification: { notificationType: string }) => {
    if (notification.notificationType === 'terminal_invite') {
      setActiveTab('terminal');
    } else if (notification.notificationType === 'audio_invite') {
      setActiveTab('audio');
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <Users className="w-4 h-4" /> },
    { id: 'chat', label: 'Chat', icon: <Bell className="w-4 h-4" /> },
    { id: 'terminal', label: 'Shared Terminals', icon: <Terminal className="w-4 h-4" /> },
    { id: 'audio', label: 'Audio Channels', icon: <Mic className="w-4 h-4" /> },
    { id: 'manage', label: 'Manage', icon: <Users className="w-4 h-4" /> },
  ];

  return (
    <div className="max-w-5xl">
      <NotificationToast
        notifications={notifications}
        onDismiss={dismiss}
        onAccept={handleNotificationAccept}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Team Collaboration</h1>
            <p className="text-text-secondary">
              Real-time presence, chat, shared terminals, and audio channels
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={wsConnected ? 'success' : 'warning'}>
              {wsConnected ? 'Connected' : 'Connecting...'}
            </Badge>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mb-6 p-1 bg-background-secondary rounded-lg overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-accent-primary/10 text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === 'overview' && selectedOrgId && (
          <div className="space-y-6">
            <PresenceIndicator orgId={selectedOrgId} />
            <OverviewCards />
          </div>
        )}

        {activeTab === 'chat' && selectedOrgId && (
          <TeamChat orgId={selectedOrgId} wsRef={wsRef} wsConnected={wsConnected} currentUserId={currentUserId} />
        )}

        {activeTab === 'terminal' && selectedOrgId && (
          <TerminalSharing orgId={selectedOrgId} />
        )}

        {activeTab === 'audio' && selectedOrgId && (
          <AudioCallUI orgId={selectedOrgId} />
        )}

        {activeTab === 'manage' && (
          <OrgManagement
            selectedOrgId={selectedOrgId}
            onOrgSelect={setSelectedOrgId}
          />
        )}

        {!selectedOrgId && activeTab !== 'manage' && (
          <Card className="p-8 text-center">
            <Users className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">No Organization</h3>
            <p className="text-text-secondary text-sm mb-4">
              You need to be part of an organization to use collaboration features.
            </p>
            <Button variant="primary" onClick={() => setActiveTab('manage')}>
              Create Organization
            </Button>
          </Card>
        )}
      </motion.div>
    </div>
  );
}

function OverviewCards() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Terminal className="w-5 h-5 text-green-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Shared Terminals</h4>
            <p className="text-xs text-text-tertiary">Real-time terminal sharing</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Share your terminal session with team members. They can watch or collaborate in real-time.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Mic className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Audio Channels</h4>
            <p className="text-xs text-text-tertiary">Up to 5 participants</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Voice communication using WebRTC mesh topology. Works across app and web.
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-purple-500" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary">Notifications</h4>
            <p className="text-xs text-text-tertiary">Real-time &amp; email</p>
          </div>
        </div>
        <p className="text-xs text-text-secondary mt-2">
          Online users get instant WebSocket notifications. Offline users receive email invites.
        </p>
      </Card>
    </div>
  );
}
