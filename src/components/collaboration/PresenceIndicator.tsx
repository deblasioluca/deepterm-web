'use client';

import { useState, useEffect, useCallback } from 'react';
import { Circle, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui';

interface PresenceMember {
  userId: string;
  email: string;
  name?: string;
  status: 'online' | 'away' | 'offline';
  lastSeen?: string;
}

interface TeamBreakdown {
  teamId: string;
  teamName: string;
  members: PresenceMember[];
}

interface PresenceIndicatorProps {
  orgId: string;
}

export function PresenceIndicator({ orgId }: PresenceIndicatorProps) {
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [teams, setTeams] = useState<TeamBreakdown[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch(`/api/zk/presence/org/${orgId}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setTeams(data.teams || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchPresence();
    const interval = setInterval(fetchPresence, 15000);
    return () => clearInterval(interval);
  }, [fetchPresence]);

  const onlineCount = members.filter(m => m.status === 'online').length;
  const totalCount = members.length;

  if (loading) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-background-tertiary animate-pulse" />
          <span className="text-text-tertiary text-sm">Loading presence...</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-text-secondary" />
          <div className="flex items-center gap-2">
            <Circle className="w-2.5 h-2.5 fill-green-500 text-green-500" />
            <span className="text-sm font-medium text-text-primary">
              {onlineCount} online
            </span>
            <span className="text-sm text-text-tertiary">
              / {totalCount} members
            </span>
          </div>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-text-tertiary" />
        ) : (
          <ChevronDown className="w-4 h-4 text-text-tertiary" />
        )}
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {teams.length > 0 ? (
            teams.map(team => (
              <div key={team.teamId}>
                <h4 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-2">
                  {team.teamName}
                </h4>
                <div className="space-y-1">
                  {team.members.map(member => (
                    <MemberRow key={member.userId} member={member} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-1">
              {members.map(member => (
                <MemberRow key={member.userId} member={member} />
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MemberRow({ member }: { member: PresenceMember }) {
  const statusColor = member.status === 'online'
    ? 'fill-green-500 text-green-500'
    : member.status === 'away'
      ? 'fill-yellow-500 text-yellow-500'
      : 'fill-gray-500 text-gray-500';

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-background-tertiary transition-colors">
      <Circle className={`w-2 h-2 ${statusColor}`} />
      <span className="text-sm text-text-primary truncate">
        {member.name || member.email.split('@')[0]}
      </span>
      <span className="text-xs text-text-tertiary truncate ml-auto">
        {member.email}
      </span>
    </div>
  );
}
