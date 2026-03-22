'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  Users,
  UserPlus,
  Eye,
  Edit3,
  Loader2,
  Circle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';

interface OrgMember {
  userId: string;
  email: string;
  status: string;
}

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

interface TerminalSharingProps {
  orgId: string;
}

export function TerminalSharing({ orgId }: TerminalSharingProps) {
  const [sessions, setSessions] = useState<SharedSession[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch ws-token to get ZKUser id (correct identity for org member comparisons)
      const tokenRes = await fetch('/api/terminal/ws-token', { method: 'POST' });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setCurrentUserId(tokenData?.userId || '');

        // Fetch active shared sessions using the token
        try {
          const sessionsRes = await fetch(`/api/zk/terminal/share?orgId=${orgId}`, {
            headers: { 'Authorization': `Bearer ${tokenData.token}` },
          });
          if (sessionsRes.ok) {
            const sessionsData = await sessionsRes.json();
            setSessions(Array.isArray(sessionsData) ? sessionsData : []);
          }
        } catch {
          // sessions fetch is optional
        }
      }

      // Fetch org members
      const membersRes = await fetch(`/api/zk/organizations/${orgId}/members`);
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        const rawMembers = Array.isArray(membersData) ? membersData : (membersData.members || membersData);
        setMembers(
          rawMembers
            .filter((m: OrgMember) => m.status === 'confirmed')
            .map((m: { userId: string; email: string; status: string }) => ({
              userId: m.userId,
              email: m.email,
              status: m.status,
            }))
        );
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const inviteToSession = async (sessionId: string, userId: string, canWrite: boolean) => {
    setInviting(userId);
    try {
      const tokenRes = await fetch('/api/terminal/ws-token', { method: 'POST' });
      if (!tokenRes.ok) return;
      const tokenData = await tokenRes.json();

      await fetch(`/api/zk/terminal/share/${sessionId}/participants`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenData.token}`,
        },
        body: JSON.stringify({ action: 'add', userId, canWrite }),
      });
      await fetchData();
    } catch {
      // silent
    } finally {
      setInviting(null);
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </Card>
    );
  }

  const otherMembers = members.filter(m => m.userId !== currentUserId);

  return (
    <div className="space-y-4">
      {/* Active sessions */}
      <Card>
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Terminal className="w-5 h-5 text-green-500" />
            Active Shared Sessions
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={fetchData}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => window.location.href = '/dashboard/terminal'}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Open Terminal Viewer
            </Button>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="p-8 text-center">
            <Terminal className="w-10 h-10 text-text-tertiary mx-auto mb-3" />
            <p className="text-text-secondary text-sm">No active shared sessions</p>
            <p className="text-text-tertiary text-xs mt-1">
              Terminal sessions are shared from the DeepTerm macOS app
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {sessions.map(session => {
              const activeParticipants = session.participants.filter(p => p.status === 'joined');
              const isOwner = session.ownerId === currentUserId;

              return (
                <div key={session.id} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Circle className="w-2.5 h-2.5 fill-green-400 text-green-400" />
                      <div>
                        <p className="text-sm font-medium text-text-primary">
                          {session.sessionName || 'Unnamed Session'}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          Shared by {session.ownerEmail} &middot; {activeParticipants.length} active
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => window.location.href = '/dashboard/terminal'}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      View
                    </Button>
                  </div>

                  {/* Participants */}
                  {session.participants.length > 0 && (
                    <div className="ml-5 mb-3">
                      <p className="text-xs text-text-tertiary mb-1.5">Participants:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {session.participants.map(p => (
                          <Badge
                            key={p.userId}
                            variant={p.status === 'joined' ? 'success' : 'default'}
                          >
                            {p.canWrite ? <Edit3 className="w-3 h-3 mr-1" /> : <Eye className="w-3 h-3 mr-1" />}
                            {p.email.split('@')[0]}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Invite team members (if session owner) */}
                  {isOwner && otherMembers.length > 0 && (
                    <div className="ml-5 pt-2 border-t border-border/50">
                      <p className="text-xs text-text-tertiary mb-2">Invite team members:</p>
                      <div className="flex flex-wrap gap-2">
                        {otherMembers
                          .filter(m => !session.participants.some(p => p.userId === m.userId))
                          .map(member => (
                            <button
                              key={member.userId}
                              onClick={() => inviteToSession(session.id, member.userId, false)}
                              disabled={inviting === member.userId}
                              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-background-tertiary text-text-secondary hover:text-text-primary hover:bg-accent-primary/10 transition-colors disabled:opacity-50"
                            >
                              {inviting === member.userId ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <UserPlus className="w-3 h-3" />
                              )}
                              {member.email.split('@')[0]}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Team members overview */}
      <Card>
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-primary" />
            Team Members ({otherMembers.length})
          </h3>
          <p className="text-xs text-text-tertiary mt-1">
            Members available for terminal sharing invites
          </p>
        </div>
        {otherMembers.length === 0 ? (
          <div className="p-6 text-center text-text-tertiary text-sm">
            No other team members in this organization yet.
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {otherMembers.map(member => (
              <div
                key={member.userId}
                className="flex items-center justify-between p-3 hover:bg-background-tertiary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent-primary/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-accent-primary">
                      {member.email.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-text-primary">
                      {member.email.split('@')[0]}
                    </p>
                    <p className="text-xs text-text-tertiary">{member.email}</p>
                  </div>
                </div>
                <Badge variant="default">
                  <Circle className="w-2 h-2 fill-gray-400 text-gray-400 mr-1" />
                  Available
                </Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
