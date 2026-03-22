'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui';
import {
  Volume2,
  Users,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for AudioChannel (needs browser APIs)
const AudioChannel = dynamic(
  () => import('@/components/audio/AudioChannel').then(mod => ({ default: mod.AudioChannel })),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-48"><Loader2 className="w-8 h-8 animate-spin text-accent-primary" /></div> }
);

interface WsAuth {
  token: string;
  userId: string;
  orgIds: string[];
}

export default function AudioPage() {
  const { data: session } = useSession();
  const [wsAuth, setWsAuth] = useState<WsAuth | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch('/api/zk/terminal/ws-token', { method: 'POST' });
      if (!res.ok) {
        setError('Failed to authenticate');
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data) {
        setWsAuth(data);
        // Fetch org details
        const orgDetails: { id: string; name: string }[] = [];
        for (const orgId of data.orgIds || []) {
          try {
            const orgRes = await fetch(`/api/zk/organizations/${orgId}`);
            if (orgRes.ok) {
              const orgData = await orgRes.json();
              orgDetails.push({ id: orgId, name: orgData.name || orgId.substring(0, 8) + '...' });
            } else {
              orgDetails.push({ id: orgId, name: orgId.substring(0, 8) + '...' });
            }
          } catch {
            orgDetails.push({ id: orgId, name: orgId.substring(0, 8) + '...' });
          }
        }
        setOrgs(orgDetails);
        if (orgDetails.length > 0 && !selectedOrgId) {
          setSelectedOrgId(orgDetails[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to get WS auth:', err);
      setError('Failed to authenticate for audio');
    } finally {
      setLoading(false);
    }
  }, [selectedOrgId]);

  useEffect(() => {
    if (session?.user) {
      fetchOrgs();
    }
  }, [session, fetchOrgs]);

  const getWsUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return '';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Volume2 className="w-6 h-6 text-accent-primary" />
          <h1 className="text-2xl font-bold text-text-primary">Audio Channels</h1>
        </div>
        <button
          onClick={() => { setLoading(true); fetchOrgs(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <Card className="p-4 mb-6 bg-red-500/10 border-red-500/30">
          <p className="text-red-400 text-sm">{error}</p>
        </Card>
      )}

      {orgs.length === 0 ? (
        <Card className="p-8 text-center">
          <Users className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
          <p className="text-text-secondary">You are not a member of any organization yet.</p>
          <p className="text-text-tertiary text-sm mt-1">Join an organization to use audio channels.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Org selector */}
          {orgs.length > 1 && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-secondary">Organization:</label>
              <select
                value={selectedOrgId || ''}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="px-3 py-1.5 rounded-lg bg-background-secondary border border-border text-text-primary text-sm"
              >
                {orgs.map(org => (
                  <option key={org.id} value={org.id}>{org.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Audio channel */}
          {selectedOrgId && wsAuth && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-0 overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-background-tertiary/50">
                  <h3 className="text-sm font-medium text-text-primary">
                    {orgs.find(o => o.id === selectedOrgId)?.name || 'Organization'} — Voice Channel
                  </h3>
                  <p className="text-xs text-text-tertiary mt-0.5">
                    WebRTC mesh — up to 5 participants
                  </p>
                </div>
                <div className="p-4">
                  <AudioChannel
                    wsUrl={getWsUrl()}
                    wsToken={wsAuth.token}
                    orgId={selectedOrgId}
                    roomId={`audio-${selectedOrgId}`}
                    userId={wsAuth.userId}
                    userEmail={session?.user?.email || wsAuth.userId}
                  />
                </div>
              </Card>

              {/* Info panel */}
              <Card className="p-5">
                <h3 className="text-sm font-medium text-text-primary mb-3">About Audio Channels</h3>
                <div className="space-y-3 text-xs text-text-secondary">
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <span>Audio uses peer-to-peer WebRTC connections for low latency</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    <span>Maximum <strong>5 participants</strong> per room (mesh topology limit)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <span>Audio is not recorded or stored — real-time only</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-1.5 flex-shrink-0" />
                    <span>Works across web UI and macOS app</span>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
