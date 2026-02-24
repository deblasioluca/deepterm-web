'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import { Users, UserPlus, Mail, Shield, Trash2, X, Loader2, AlertCircle } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'pending';
  joinedAt: string | null;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    try {
      const response = await fetch('/api/team/members');
      if (response.ok) {
        const data = await response.json();
        setMembers(data.members || []);
        setInvitations(data.invitations || []);
        setIsOwner(data.isOwner || false);
        setIsAdmin(data.isAdmin || false);
      }
    } catch (err) {
      console.error('Failed to fetch team members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to send invitation');
      }

      setInvitations((prev) => [data.invitation, ...prev]);
      setIsInviteModalOpen(false);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (memberId: string, newRole: string) => {
    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (response.ok) {
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: newRole as Member['role'] } : m))
        );
        setIsRoleModalOpen(false);
        setSelectedMember(null);
      }
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Are you sure you want to remove this member from the team?')) return;

    try {
      const response = await fetch(`/api/team/members/${memberId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleCancelInvitation = async (invitationId: string) => {
    try {
      const response = await fetch(`/api/team/invitations/${invitationId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
      }
    } catch (err) {
      console.error('Failed to cancel invitation:', err);
    }
  };

  const getRoleBadgeVariant = (role: string) => {
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
            <h1 className="text-3xl font-bold text-text-primary mb-2">Your Team</h1>
            <p className="text-text-secondary">
              Manage team members and their permissions
            </p>
          </div>
          {(isOwner || isAdmin) && (
            <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Invite Member
            </Button>
          )}
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <Card className="mb-6">
            <h3 className="font-semibold text-text-primary mb-4">Pending Invitations</h3>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
                      <Mail className="w-5 h-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{invitation.email}</p>
                      <p className="text-sm text-text-tertiary">
                        Invited as {invitation.role}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">Pending</Badge>
                    {(isOwner || isAdmin) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-accent-danger"
                        onClick={() => handleCancelInvitation(invitation.id)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Team Members */}
        <Card>
          {members.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-text-primary mb-2">
                No team members yet
              </h3>
              <p className="text-text-secondary mb-6">
                Invite your first team member to start collaborating
              </p>
              <Button variant="primary" onClick={() => setIsInviteModalOpen(true)}>
                <UserPlus className="w-4 h-4 mr-2" />
                Invite Member
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 text-sm font-medium text-text-secondary">
                      Name
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-text-secondary">
                      Email
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-text-secondary">
                      Role
                    </th>
                    <th className="text-left py-4 px-4 text-sm font-medium text-text-secondary">
                      Status
                    </th>
                    {(isOwner || isAdmin) && (
                      <th className="text-right py-4 px-4 text-sm font-medium text-text-secondary">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {members.map((member) => (
                    <tr key={member.id} className="border-b border-border/50 last:border-0">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-accent-primary/20 rounded-full flex items-center justify-center">
                            <span className="text-sm font-medium text-accent-primary">
                              {member.name?.charAt(0) || member.email.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-text-primary">
                            {member.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-text-secondary">{member.email}</td>
                      <td className="py-4 px-4">
                        <Badge variant={getRoleBadgeVariant(member.role)}>
                          {member.role}
                        </Badge>
                      </td>
                      <td className="py-4 px-4">
                        <Badge variant={member.status === 'active' ? 'success' : 'warning'}>
                          {member.status}
                        </Badge>
                      </td>
                      {(isOwner || isAdmin) && (
                        <td className="py-4 px-4 text-right">
                          {member.role !== 'owner' && (
                            <div className="flex items-center justify-end gap-2">
                              {isOwner && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedMember(member);
                                    setIsRoleModalOpen(true);
                                  }}
                                >
                                  <Shield className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-accent-danger"
                                onClick={() => handleRemoveMember(member.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      {/* Invite Modal */}
      <Modal
        isOpen={isInviteModalOpen}
        onClose={() => {
          setIsInviteModalOpen(false);
          setError('');
        }}
        title="Invite Team Member"
        description="Send an invitation to join your team"
      >
        <form onSubmit={handleInvite} className="space-y-4">
          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
              <span className="text-red-500 text-sm">{error}</span>
            </div>
          )}
          <Input
            label="Email Address"
            type="email"
            placeholder="colleague@company.com"
            icon={<Mail className="w-5 h-5" />}
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Role
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setIsInviteModalOpen(false);
                setError('');
              }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send Invitation'
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Change Role Modal */}
      <Modal
        isOpen={isRoleModalOpen}
        onClose={() => {
          setIsRoleModalOpen(false);
          setSelectedMember(null);
        }}
        title="Change Member Role"
        description={`Update role for ${selectedMember?.name || selectedMember?.email}`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <button
              onClick={() => selectedMember && handleUpdateRole(selectedMember.id, 'admin')}
              className={`w-full p-4 rounded-lg border text-left transition-colors ${
                selectedMember?.role === 'admin'
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border hover:border-accent-primary/50'
              }`}
            >
              <div className="font-medium text-text-primary">Admin</div>
              <div className="text-sm text-text-secondary">
                Can invite and remove members, manage vaults
              </div>
            </button>
            <button
              onClick={() => selectedMember && handleUpdateRole(selectedMember.id, 'member')}
              className={`w-full p-4 rounded-lg border text-left transition-colors ${
                selectedMember?.role === 'member'
                  ? 'border-accent-primary bg-accent-primary/10'
                  : 'border-border hover:border-accent-primary/50'
              }`}
            >
              <div className="font-medium text-text-primary">Member</div>
              <div className="text-sm text-text-secondary">
                Can access shared vaults and credentials
              </div>
            </button>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setIsRoleModalOpen(false);
              setSelectedMember(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
}
