'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Users,
  UserPlus,
  Loader2,
  Circle,
  Volume2,
  ExternalLink,
} from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';

interface OrgMember {
  userId: string;
  email: string;
  status: string;
}

interface AudioCallUIProps {
  orgId: string;
}

export function AudioCallUI({ orgId }: AudioCallUIProps) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch ws-token to get ZKUser id (correct identity for org member comparisons)
      const tokenRes = await fetch('/api/terminal/ws-token', { method: 'POST' });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        setCurrentUserId(tokenData?.userId || '');
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
      {/* Quick Actions */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-text-primary">Audio Channels</h3>
              <p className="text-xs text-text-tertiary">
                WebRTC peer-to-peer voice &middot; up to 5 participants
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => window.location.href = '/dashboard/audio'}
          >
            <ExternalLink className="w-4 h-4 mr-1" />
            Open Audio
          </Button>
        </div>
      </Card>

      {/* Team members to call */}
      <Card>
        <div className="p-4 border-b border-border">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-primary" />
            Team Members ({otherMembers.length})
          </h3>
          <p className="text-xs text-text-tertiary mt-1">
            Start a voice call with team members via Audio Channels
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
                  <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                    <span className="text-xs font-medium text-blue-500">
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
                <div className="flex items-center gap-2">
                  <Badge variant="default">
                    <Circle className="w-2 h-2 fill-gray-400 text-gray-400 mr-1" />
                    Available
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => window.location.href = '/dashboard/audio'}
                    title="Start audio call"
                  >
                    <Phone className="w-4 h-4 text-green-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Audio info */}
      <Card className="p-4">
        <h4 className="text-sm font-medium text-text-primary mb-3">How Audio Channels Work</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-start gap-2">
            <Mic className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-text-primary">Voice Chat</p>
              <p className="text-xs text-text-tertiary">Real-time audio via WebRTC mesh</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MicOff className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-text-primary">Mute Control</p>
              <p className="text-xs text-text-tertiary">Toggle microphone on/off anytime</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <UserPlus className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-text-primary">Add Participants</p>
              <p className="text-xs text-text-tertiary">Invite up to 5 members per room</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <PhoneOff className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-medium text-text-primary">Leave Anytime</p>
              <p className="text-xs text-text-tertiary">No recording — real-time only</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
