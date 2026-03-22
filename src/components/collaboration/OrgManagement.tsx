'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Users, UserPlus, Shield, Trash2, X, Loader2, AlertCircle,
  Building2, Plus, Settings, ChevronRight, Mail,
} from 'lucide-react';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';

interface OrgData {
  id: string;
  name: string;
  plan: string;
  memberCount: number;
  role: string;
}

interface OrgMember {
  id: string;
  userId: string | null;
  email: string;
  name: string;
  role: string;
  status: string;
  invitedEmail: string | null;
}

interface OrgTeamData {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  isDefault: boolean;
}

interface OrgManagementProps {
  onOrgSelect?: (orgId: string) => void;
  selectedOrgId?: string | null;
}

export function OrgManagement({ onOrgSelect, selectedOrgId }: OrgManagementProps) {
  const [orgs, setOrgs] = useState<OrgData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrg, setActiveOrg] = useState<string | null>(selectedOrgId || null);
  const [view, setView] = useState<'orgs' | 'members' | 'teams'>('orgs');

  const fetchOrgs = useCallback(async () => {
    try {
      const res = await fetch('/api/zk/organizations');
      if (res.ok) {
        const data = await res.json();
        const rawOrgs = Array.isArray(data) ? data : (data.organizations || []);
        const orgList: OrgData[] = rawOrgs.map((o: Record<string, unknown>) => ({
          id: o.id as string,
          name: o.name as string,
          plan: (o.plan as string) || 'free',
          memberCount: typeof o.memberCount === 'number' ? o.memberCount : 0,
          role: typeof o.role === 'string' ? o.role : 'member',
        }));
        setOrgs(orgList);
        if (orgList.length > 0 && !activeOrg) {
          const first = orgList[0].id;
          setActiveOrg(first);
          onOrgSelect?.(first);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [activeOrg, onOrgSelect]);

  useEffect(() => {
    fetchOrgs();
  }, [fetchOrgs]);

  useEffect(() => {
    if (selectedOrgId) setActiveOrg(selectedOrgId);
  }, [selectedOrgId]);

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </Card>
    );
  }

  if (orgs.length === 0) {
    return <NoOrgsState onRefresh={fetchOrgs} />;
  }

  const currentOrg = orgs.find(o => o.id === activeOrg) || orgs[0];

  return (
    <div className="space-y-4">
      {/* Org selector */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary flex items-center gap-2">
            <Building2 className="w-5 h-5 text-accent-primary" />
            Organizations
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => {
                setActiveOrg(org.id);
                onOrgSelect?.(org.id);
                setView('orgs');
              }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeOrg === org.id
                  ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/30'
                  : 'bg-background-tertiary text-text-secondary hover:text-text-primary border border-transparent'
              }`}
            >
              <Building2 className="w-4 h-4" />
              {org.name}
              <Badge variant="default">{org.memberCount}</Badge>
            </button>
          ))}
        </div>
      </Card>

      {/* View tabs */}
      <div className="flex gap-2">
        <TabButton active={view === 'members'} onClick={() => setView('members')} icon={<Users className="w-4 h-4" />} label="Members" />
        <TabButton active={view === 'teams'} onClick={() => setView('teams')} icon={<Settings className="w-4 h-4" />} label="Teams" />
      </div>

      {/* Content */}
      {view === 'members' && <MembersView orgId={currentOrg.id} orgRole={currentOrg.role} />}
      {view === 'teams' && <TeamsView orgId={currentOrg.id} orgRole={currentOrg.role} />}
      {view === 'orgs' && (
        <Card className="p-6 text-center text-text-secondary text-sm">
          Select &quot;Members&quot; or &quot;Teams&quot; above to manage your organization.
        </Card>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-accent-primary/10 text-accent-primary'
          : 'bg-background-secondary text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function NoOrgsState({ onRefresh }: { onRefresh: () => void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  const createOrg = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/zk/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName('');
        onRefresh();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card className="p-8 text-center">
      <Building2 className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-text-primary mb-2">No Organization</h3>
      <p className="text-text-secondary text-sm mb-6">
        Create an organization to start collaborating with your team.
      </p>
      <div className="flex gap-2 max-w-sm mx-auto">
        <Input
          placeholder="Organization name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <Button variant="primary" onClick={createOrg} disabled={creating || !name.trim()}>
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        </Button>
      </div>
    </Card>
  );
}

// ── Members View ──────────────────────────────────────────────────────────────

function MembersView({ orgId, orgRole }: { orgId: string; orgRole: string }) {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const canManage = orgRole === 'owner' || orgRole === 'admin';

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/zk/organizations/${orgId}/members`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/zk/organizations/${orgId}/members/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invitation');
      }
      setInviteEmail('');
      setShowInvite(false);
      fetchMembers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remove this member from the organization?')) return;
    try {
      await fetch(`/api/zk/organizations/${orgId}/members/${memberId}`, { method: 'DELETE' });
      fetchMembers();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">Members ({members.length})</h3>
        {canManage && (
          <Button variant="primary" onClick={() => setShowInvite(true)}>
            <UserPlus className="w-4 h-4 mr-2" />
            Invite
          </Button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="p-8 text-center text-text-tertiary">
          No members yet. Invite someone to get started.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {members.map(member => (
            <div key={member.id} className="flex items-center justify-between p-4 hover:bg-background-tertiary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-accent-primary/20 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-accent-primary">
                    {(member.name || member.email || member.invitedEmail || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {member.name || member.email || member.invitedEmail || 'Unknown'}
                  </p>
                  <p className="text-xs text-text-tertiary">{member.email || member.invitedEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={member.role === 'owner' ? 'primary' : member.role === 'admin' ? 'secondary' : 'default'}>
                  {member.role}
                </Badge>
                {member.status === 'invited' && <Badge variant="warning">Pending</Badge>}
                {canManage && member.role !== 'owner' && (
                  <button onClick={() => handleRemove(member.id)} className="p-1 text-text-tertiary hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal isOpen={showInvite} onClose={() => { setShowInvite(false); setError(''); }} title="Invite Member" description="Send an invitation to join your organization">
        <form onSubmit={handleInvite} className="space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <span className="text-red-500 text-sm">{error}</span>
            </div>
          )}
          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@company.com"
            icon={<Mail className="w-5 h-5" />}
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Role</label>
            <select
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-lg px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => { setShowInvite(false); setError(''); }} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending...</> : 'Send Invitation'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

// ── Teams View ────────────────────────────────────────────────────────────────

function TeamsView({ orgId, orgRole }: { orgId: string; orgRole: string }) {
  const [teams, setTeams] = useState<OrgTeamData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const canManage = orgRole === 'owner' || orgRole === 'admin';

  const fetchTeams = useCallback(async () => {
    try {
      const res = await fetch(`/api/zk/organizations/${orgId}/teams`);
      if (res.ok) {
        const data = await res.json();
        setTeams(data.teams || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setLoading(true);
    fetchTeams();
  }, [fetchTeams]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/zk/organizations/${orgId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTeamName.trim(), description: newTeamDesc.trim() || undefined }),
      });
      if (res.ok) {
        setNewTeamName('');
        setNewTeamDesc('');
        setShowCreate(false);
        fetchTeams();
      }
    } catch {
      // silent
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (teamId: string) => {
    if (!confirm('Delete this team? Members will not be removed from the organization.')) return;
    try {
      await fetch(`/api/zk/organizations/${orgId}/teams/${teamId}`, { method: 'DELETE' });
      fetchTeams();
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <Card className="p-6 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-text-primary">Teams ({teams.length})</h3>
        {canManage && (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Team
          </Button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="p-8 text-center text-text-tertiary">
          No teams yet. Create a team to organize your members.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {teams.map(team => (
            <div key={team.id} className="flex items-center justify-between p-4 hover:bg-background-tertiary/50 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-accent-primary/20 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-accent-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-text-primary">{team.name}</p>
                    {team.isDefault && <Badge variant="secondary">Default</Badge>}
                  </div>
                  {team.description && (
                    <p className="text-xs text-text-tertiary">{team.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="default">{team.memberCount} members</Badge>
                {canManage && !team.isDefault && (
                  <button onClick={() => handleDelete(team.id)} className="p-1 text-text-tertiary hover:text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <ChevronRight className="w-4 h-4 text-text-tertiary" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Team Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Team" description="Create a new team within your organization">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Team Name"
            placeholder="Engineering"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            required
          />
          <Input
            label="Description (optional)"
            placeholder="Backend and frontend engineers"
            value={newTeamDesc}
            onChange={e => setNewTeamDesc(e.target.value)}
          />
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={creating || !newTeamName.trim()}>
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Team'}
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
