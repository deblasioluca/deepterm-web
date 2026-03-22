'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge } from '@/components/ui';
import {
  Building2,
  Users,
  UserPlus,
  ChevronDown,
  ChevronRight,
  Check,
  Loader2,
  Shield,
  Crown,
  Mail,
  Hash,
} from 'lucide-react';

interface OrgMember {
  id: string;
  userId: string;
  email: string;
  role: string;
  status: string;
  invitedAt?: string;
  confirmedAt?: string;
}

interface OrgTeam {
  id: string;
  name: string;
  memberCount: number;
  members?: OrgMember[];
}

interface Organization {
  id: string;
  name: string;
  role: string;
  status: string;
  memberCount: number;
  teamCount: number;
  teams: OrgTeam[];
  pendingInvites: OrgMember[];
  confirmedMembers: OrgMember[];
}

interface PendingInvite {
  orgId: string;
  orgName: string;
  role: string;
  invitedAt?: string;
}

export default function OrganizationPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [accepting, setAccepting] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch organizations the user belongs to
      const orgsRes = await fetch('/api/zk/organizations');
      if (!orgsRes.ok) {
        setLoading(false);
        return;
      }
      const orgsData = await orgsRes.json();
      const rawOrgs = Array.isArray(orgsData) ? orgsData : (orgsData.organizations || []);

      // Separate confirmed orgs and pending invites
      const confirmed = rawOrgs.filter((o: { status?: string }) => o.status === 'confirmed');
      const pending = rawOrgs
        .filter((o: { status?: string }) => o.status === 'invited')
        .map((o: { id: string; name: string; role?: string; invitedAt?: string }) => ({
          orgId: o.id,
          orgName: o.name,
          role: o.role || 'member',
          invitedAt: o.invitedAt,
        }));

      setPendingInvites(pending);

      // For each confirmed org, fetch members and teams
      const enrichedOrgs: Organization[] = await Promise.all(
        confirmed.map(async (org: { id: string; name: string; role?: string; status?: string }) => {
          let members: OrgMember[] = [];
          let teams: OrgTeam[] = [];

          // Fetch members
          try {
            const membersRes = await fetch(`/api/zk/organizations/${org.id}/members`);
            if (membersRes.ok) {
              const membersData = await membersRes.json();
              const rawMembers = Array.isArray(membersData) ? membersData : (membersData.members || membersData);
              members = rawMembers.map((m: OrgMember) => ({
                id: m.id,
                userId: m.userId,
                email: m.email,
                role: m.role,
                status: m.status,
                invitedAt: m.invitedAt,
                confirmedAt: m.confirmedAt,
              }));
            }
          } catch {
            // silent
          }

          // Fetch teams
          try {
            const teamsRes = await fetch(`/api/zk/organizations/${org.id}/teams`);
            if (teamsRes.ok) {
              const teamsData = await teamsRes.json();
              const rawTeams = Array.isArray(teamsData) ? teamsData : (teamsData.teams || []);
              teams = rawTeams.map((t: { id: string; name: string; memberCount?: number; _count?: { members: number } }) => ({
                id: t.id,
                name: t.name,
                memberCount: t.memberCount || t._count?.members || 0,
              }));
            }
          } catch {
            // silent
          }

          const confirmedMembers = members.filter(m => m.status === 'confirmed');
          const pendingInvites = members.filter(m => m.status === 'invited');

          return {
            id: org.id,
            name: org.name,
            role: org.role || 'member',
            status: org.status || 'confirmed',
            memberCount: confirmedMembers.length,
            teamCount: teams.length,
            teams,
            pendingInvites,
            confirmedMembers,
          };
        })
      );

      setOrganizations(enrichedOrgs);

      // Auto-expand first org
      if (enrichedOrgs.length > 0 && expandedOrgs.size === 0) {
        setExpandedOrgs(new Set([enrichedOrgs[0].id]));
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleOrg = (orgId: string) => {
    setExpandedOrgs(prev => {
      const next = new Set(prev);
      if (next.has(orgId)) {
        next.delete(orgId);
      } else {
        next.add(orgId);
      }
      return next;
    });
  };

  const toggleTeam = (teamId: string) => {
    setExpandedTeams(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const acceptInvite = async (orgId: string) => {
    setAccepting(orgId);
    try {
      const res = await fetch(`/api/zk/organizations/${orgId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        // Remove from pending, refresh data
        setPendingInvites(prev => prev.filter(p => p.orgId !== orgId));
        await fetchData();
      }
    } catch {
      // silent
    } finally {
      setAccepting(null);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-3.5 h-3.5 text-amber-500" />;
      case 'admin':
        return <Shield className="w-3.5 h-3.5 text-blue-500" />;
      default:
        return <Users className="w-3.5 h-3.5 text-text-tertiary" />;
    }
  };

  const getRoleBadgeVariant = (role: string): 'primary' | 'secondary' | 'default' => {
    switch (role) {
      case 'owner':
        return 'primary';
      case 'admin':
        return 'secondary';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Organizations</h1>
            <p className="text-text-secondary">
              Manage your organizations, teams, and members
            </p>
          </div>
        </div>

        {/* Pending Invitations Banner */}
        {pendingInvites.length > 0 && (
          <Card className="mb-6 border-amber-500/30 bg-amber-500/5">
            <div className="p-4">
              <h3 className="font-semibold text-text-primary flex items-center gap-2 mb-3">
                <Mail className="w-5 h-5 text-amber-500" />
                Pending Invitations ({pendingInvites.length})
              </h3>
              <div className="space-y-2">
                {pendingInvites.map(invite => (
                  <div
                    key={invite.orgId}
                    className="flex items-center justify-between p-3 bg-background-secondary rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">{invite.orgName}</p>
                        <p className="text-xs text-text-tertiary">
                          Invited as {invite.role}
                          {invite.invitedAt && ` \u00b7 ${new Date(invite.invitedAt).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => acceptInvite(invite.orgId)}
                      disabled={accepting === invite.orgId}
                    >
                      {accepting === invite.orgId ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-1" />
                          Accept
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Organizations List */}
        {organizations.length === 0 && pendingInvites.length === 0 ? (
          <Card className="p-12 text-center">
            <Building2 className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No Organizations
            </h3>
            <p className="text-text-secondary">
              You are not part of any organization yet. Organizations are created from the DeepTerm macOS app.
            </p>
          </Card>
        ) : (
          <div className="space-y-4">
            {organizations.map(org => {
              const isExpanded = expandedOrgs.has(org.id);

              return (
                <Card key={org.id} className="overflow-hidden">
                  {/* Org Header */}
                  <button
                    onClick={() => toggleOrg(org.id)}
                    className="w-full flex items-center justify-between p-4 hover:bg-background-tertiary/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent-primary/20 rounded-lg flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-accent-primary" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-text-primary">{org.name}</h3>
                          <Badge variant={getRoleBadgeVariant(org.role)}>
                            {org.role}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-text-tertiary mt-0.5">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {org.memberCount} member{org.memberCount !== 1 ? 's' : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            <Hash className="w-3 h-3" />
                            {org.teamCount} team{org.teamCount !== 1 ? 's' : ''}
                          </span>
                          {org.pendingInvites.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <Mail className="w-3 h-3" />
                              {org.pendingInvites.length} pending
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-text-tertiary" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-text-tertiary" />
                    )}
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="border-t border-border">
                      {/* Teams Section */}
                      {org.teams.length > 0 && (
                        <div className="p-4 border-b border-border/50">
                          <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                            <Hash className="w-4 h-4" />
                            Teams ({org.teams.length})
                          </h4>
                          <div className="space-y-1">
                            {org.teams.map(team => {
                              const isTeamExpanded = expandedTeams.has(team.id);
                              return (
                                <div key={team.id}>
                                  <button
                                    onClick={() => toggleTeam(team.id)}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-background-tertiary/50 transition-colors text-left"
                                  >
                                    <div className="flex items-center gap-2">
                                      {isTeamExpanded ? (
                                        <ChevronDown className="w-4 h-4 text-text-tertiary" />
                                      ) : (
                                        <ChevronRight className="w-4 h-4 text-text-tertiary" />
                                      )}
                                      <span className="text-sm font-medium text-text-primary">
                                        {team.name}
                                      </span>
                                    </div>
                                    <span className="text-xs text-text-tertiary">
                                      {team.memberCount} member{team.memberCount !== 1 ? 's' : ''}
                                    </span>
                                  </button>
                                  {isTeamExpanded && (
                                    <div className="ml-8 mt-1 mb-2 text-xs text-text-tertiary">
                                      <p>Team members are managed from the DeepTerm macOS app.</p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Confirmed Members */}
                      <div className="p-4 border-b border-border/50">
                        <h4 className="text-sm font-medium text-text-secondary mb-3 flex items-center gap-2">
                          <Users className="w-4 h-4" />
                          Members ({org.confirmedMembers.length})
                        </h4>
                        {org.confirmedMembers.length === 0 ? (
                          <p className="text-xs text-text-tertiary px-3">No confirmed members yet.</p>
                        ) : (
                          <div className="space-y-1">
                            {org.confirmedMembers.map(member => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-background-tertiary/30 transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 bg-accent-primary/15 rounded-full flex items-center justify-center">
                                    <span className="text-[10px] font-bold text-accent-primary">
                                      {member.email.charAt(0).toUpperCase()}
                                    </span>
                                  </div>
                                  <div>
                                    <p className="text-sm text-text-primary">{member.email}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {getRoleIcon(member.role)}
                                  <Badge variant={getRoleBadgeVariant(member.role)}>
                                    {member.role}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Pending Invites for this org */}
                      {org.pendingInvites.length > 0 && (
                        <div className="p-4">
                          <h4 className="text-sm font-medium text-amber-500 mb-3 flex items-center gap-2">
                            <UserPlus className="w-4 h-4" />
                            Pending Invites ({org.pendingInvites.length})
                          </h4>
                          <div className="space-y-1">
                            {org.pendingInvites.map(member => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-amber-500/5"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="w-7 h-7 bg-amber-500/15 rounded-full flex items-center justify-center">
                                    <Mail className="w-3 h-3 text-amber-500" />
                                  </div>
                                  <div>
                                    <p className="text-sm text-text-primary">{member.email}</p>
                                    <p className="text-[10px] text-text-tertiary">
                                      Invited as {member.role}
                                      {member.invitedAt && ` \u00b7 ${new Date(member.invitedAt).toLocaleDateString()}`}
                                    </p>
                                  </div>
                                </div>
                                <Badge variant="warning">Pending</Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
