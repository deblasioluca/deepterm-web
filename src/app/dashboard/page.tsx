'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { useSession } from 'next-auth/react';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import {
  User,
  Mail,
  Lock,
  Shield,
  Smartphone,
  Trash2,
  AlertTriangle,
  LogOut,
  Loader2,
} from 'lucide-react';

// Default user data (used as initial state before session loads)
const defaultUser = {
  id: '',
  name: '',
  email: '',
  role: 'member',
  teamName: '',
  avatarUrl: null,
  twoFactorEnabled: false,
};

const mockSessions = [
  {
    id: '1',
    device: 'MacBook Pro 16" (M3 Max)',
    location: 'San Francisco, CA',
    lastActive: 'Now',
    current: true,
  },
  {
    id: '2',
    device: 'iPhone 15 Pro',
    location: 'San Francisco, CA',
    lastActive: '2 hours ago',
    current: false,
  },
];

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [user, setUser] = useState(defaultUser);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [sessions] = useState(mockSessions);

  // Update user state when session loads
  useEffect(() => {
    if (session?.user) {
      setUser({
        id: (session.user as { id?: string }).id || '',
        name: session.user.name || '',
        email: session.user.email || '',
        role: (session.user as { role?: string }).role || 'member',
        teamName: (session.user as { teamName?: string }).teamName || '',
        avatarUrl: null,
        twoFactorEnabled: false, // TODO: Fetch from API
      });
    }
  }, [session]);

  const handleSave = () => {
    // In a real app, this would save to the API
    console.log('Saving user:', user);
  };

  // Show loading state while session is loading
  if (status === 'loading') {
    return (
      <div className="max-w-4xl flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <h1 className="text-3xl font-bold text-text-primary mb-2">Account</h1>
        <p className="text-text-secondary mb-8">
          Manage your profile and account settings
        </p>

        {/* Profile Section */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-accent-primary" />
            Profile Information
          </h2>

          {/* Avatar */}
          <div className="flex items-center gap-6 mb-6">
            <div className="w-20 h-20 bg-accent-primary/20 rounded-full flex items-center justify-center">
              <span className="text-2xl font-bold text-accent-primary">
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </span>
            </div>
            <div>
              <Button variant="secondary" size="sm">
                Upload Photo
              </Button>
              <p className="text-sm text-text-tertiary mt-2">
                JPG, PNG or GIF. Max 2MB.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Full Name"
              value={user.name}
              onChange={(e) => setUser({ ...user, name: e.target.value })}
            />
            <Input
              label="Email"
              type="email"
              value={user.email}
              disabled
              icon={<Mail className="w-5 h-5" />}
            />
          </div>

          <div className="mt-4 flex items-center gap-4">
            <Badge variant="primary">{user.role}</Badge>
            {user.teamName && (
              <span className="text-sm text-text-secondary">
                Team: {user.teamName}
              </span>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={handleSave}>
              Save Changes
            </Button>
          </div>
        </Card>

        {/* Password Section */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-accent-primary" />
            Password
          </h2>
          <p className="text-text-secondary mb-4">
            Change your password to keep your account secure.
          </p>
          <Button variant="secondary" onClick={() => setIsPasswordModalOpen(true)}>
            Change Password
          </Button>
        </Card>

        {/* Two-Factor Authentication */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5 text-accent-primary" />
            Two-Factor Authentication
          </h2>
          <p className="text-text-secondary mb-4">
            Add an extra layer of security to your account.
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-6 rounded-full relative cursor-pointer transition-colors ${
                  user.twoFactorEnabled ? 'bg-accent-secondary' : 'bg-background-tertiary'
                }`}
                onClick={() =>
                  setUser({ ...user, twoFactorEnabled: !user.twoFactorEnabled })
                }
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${
                    user.twoFactorEnabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`}
                />
              </div>
              <span className="text-text-secondary">
                {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {!user.twoFactorEnabled && (
              <Link href="/dashboard/2fa">
                <Button variant="secondary" size="sm">
                  Set Up 2FA
                </Button>
              </Link>
            )}
          </div>
        </Card>

        {/* Active Sessions */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-accent-primary" />
            Active Sessions
          </h2>
          <div className="space-y-4">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between py-3 border-b border-border last:border-0"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-text-primary font-medium">
                      {session.device}
                    </span>
                    {session.current && (
                      <Badge variant="success" size="sm">
                        Current
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-text-secondary">
                    {session.location} • {session.lastActive}
                  </p>
                </div>
                {!session.current && (
                  <Button variant="ghost" size="sm" className="text-accent-danger">
                    <LogOut className="w-4 h-4 mr-2" />
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Danger Zone */}
        <Card className="border-accent-danger/30">
          <h2 className="text-lg font-semibold text-accent-danger mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Danger Zone
          </h2>
          <p className="text-text-secondary mb-4">
            Once you delete your account, there is no going back. Please be certain.
          </p>
          <Button
            variant="danger"
            onClick={() => setIsDeleteModalOpen(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Account
          </Button>
        </Card>
      </motion.div>

      {/* Delete Account Modal */}
      <Modal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Account"
        description="This action cannot be undone. All your data will be permanently deleted."
      >
        <div className="space-y-4">
          <div className="p-4 bg-accent-danger/10 border border-accent-danger/30 rounded-lg">
            <p className="text-sm text-text-primary">
              Please type <strong>delete my account</strong> to confirm.
            </p>
          </div>
          <Input placeholder="delete my account" />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsDeleteModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="danger" className="flex-1">
              Delete Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title="Change Password"
      >
        <form className="space-y-4">
          <Input
            label="Current Password"
            type="password"
            placeholder="••••••••"
          />
          <Input
            label="New Password"
            type="password"
            placeholder="••••••••"
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="••••••••"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => setIsPasswordModalOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="primary" className="flex-1">
              Update Password
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
