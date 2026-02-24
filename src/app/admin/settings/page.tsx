'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input, Badge } from '@/components/ui';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  Settings,
  Globe,
  Mail,
  Shield,
  Database,
  Bell,
  Fingerprint,
  HelpCircle,
  Loader2,
  Check,
  AlertCircle,
  Save,
  MessageSquare,
} from 'lucide-react';

interface SystemSettings {
  siteName: string;
  siteUrl: string;
  supportEmail: string;
  helpPageContent: string;
  maintenanceMode: boolean;
  allowRegistration: boolean;
  requireEmailVerification: boolean;
  notifyUsersOnNewVersion: boolean;
  maxTeamSize: number;
  trialDays: number;
  stripeWebhookSecret: string;
}

type Admin2FAStatus = {
  enabled: boolean;
  backupCodesRemaining: number;
  passkeysCount: number;
};

type PasskeyRow = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    siteName: 'DeepTerm',
    siteUrl: 'https://deepterm.net',
    supportEmail: 'support@deepterm.net',
    helpPageContent: '',
    maintenanceMode: false,
    allowRegistration: true,
    requireEmailVerification: true,
    notifyUsersOnNewVersion: false,
    maxTeamSize: 100,
    trialDays: 14,
    stripeWebhookSecret: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [success, setSuccess] = useState(false);
  const [testEmailSuccess, setTestEmailSuccess] = useState<string | null>(null);
  const [isSendingTestWhatsApp, setIsSendingTestWhatsApp] = useState(false);
  const [testWhatsAppType, setTestWhatsAppType] = useState('triage');
  const [testWhatsAppSuccess, setTestWhatsAppSuccess] = useState<string | null>(null);
  const [testWhatsAppError, setTestWhatsAppError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [webAuthnSupported, setWebAuthnSupported] = useState(true);
  const [admin2fa, setAdmin2fa] = useState<Admin2FAStatus | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpDisableCode, setTotpDisableCode] = useState('');
  const [adminBackupCodes, setAdminBackupCodes] = useState<string[] | null>(null);
  const [adminPasskeys, setAdminPasskeys] = useState<PasskeyRow[]>([]);
  const [isSettingUpTotp, setIsSettingUpTotp] = useState(false);
  const [isEnablingTotp, setIsEnablingTotp] = useState(false);
  const [isDisablingTotp, setIsDisablingTotp] = useState(false);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState('Admin Passkey');

  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [releasePlatform, setReleasePlatform] = useState<'macos' | 'windows' | 'linux' | 'ios'>('macos');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isUploadingRelease, setIsUploadingRelease] = useState(false);
  const [releasesList, setReleasesList] = useState<
    { platform: string; version: string; publishedAt: string; filePath: string; createdBy: string | null; releaseNotes?: string }[]
  >([]);
  const [editReleaseVersion, setEditReleaseVersion] = useState('');
  const [editReleasePlatform, setEditReleasePlatform] = useState<'macos' | 'windows' | 'linux' | 'ios'>('macos');
  const [editReleaseNotes, setEditReleaseNotes] = useState('');
  const [isSavingReleaseNotes, setIsSavingReleaseNotes] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    setWebAuthnSupported(browserSupportsWebAuthn());
    fetchAdminSecurity();
    fetchReleasesList();
  }, []);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/admin/settings');
      if (response.ok) {
        const data = await response.json();
        setSettings((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);

      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const fetchAdminSecurity = async () => {
    try {
      const [statusRes, passkeysRes] = await Promise.all([
        fetch('/api/admin/auth/2fa/status'),
        fetch('/api/admin/auth/passkey'),
      ]);

      if (statusRes.ok) {
        const status = (await statusRes.json()) as Admin2FAStatus;
        setAdmin2fa(status);
      }

      if (passkeysRes.ok) {
        const data = await passkeysRes.json();
        setAdminPasskeys((data?.passkeys || []) as PasskeyRow[]);
      }
    } catch (err) {
      console.error('Failed to fetch admin security:', err);
    }
  };

  const fetchReleasesList = async () => {
    try {
      const res = await fetch('/api/admin/releases');
      if (!res.ok) return;
      const data = await res.json();
      setReleasesList(
        Array.isArray(data?.releases)
          ? (data.releases as { platform: string; version: string; publishedAt: string; filePath: string; createdBy: string | null; releaseNotes?: string }[])
          : []
      );
    } catch (err) {
      console.error('Failed to fetch releases list:', err);
    }
  };

  const startTotpSetup = async () => {
    try {
      setIsSettingUpTotp(true);
      setError(null);
      setAdminBackupCodes(null);

      const res = await fetch('/api/admin/auth/2fa/setup', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start 2FA setup');
      }

      setTotpSetup({ secret: data.secret, qrCode: data.qrCode });
      setTotpCode('');
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start 2FA setup');
    } finally {
      setIsSettingUpTotp(false);
    }
  };

  const enableTotp = async () => {
    try {
      setIsEnablingTotp(true);
      setError(null);
      setAdminBackupCodes(null);

      const res = await fetch('/api/admin/auth/2fa/enable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to enable 2FA');
      }

      setAdminBackupCodes(Array.isArray(data.backupCodes) ? data.backupCodes : null);
      setTotpSetup(null);
      setTotpCode('');
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable 2FA');
    } finally {
      setIsEnablingTotp(false);
    }
  };

  const disableTotp = async () => {
    try {
      setIsDisablingTotp(true);
      setError(null);

      const res = await fetch('/api/admin/auth/2fa/disable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpDisableCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to disable 2FA');
      }

      setTotpSetup(null);
      setTotpDisableCode('');
      setAdminBackupCodes(null);
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disable 2FA');
    } finally {
      setIsDisablingTotp(false);
    }
  };

  const registerAdminPasskey = async () => {
    try {
      setIsRegisteringPasskey(true);
      setError(null);

      const optionsRes = await fetch('/api/admin/auth/passkey/register/options', {
        method: 'POST',
      });

      const options = await optionsRes.json();
      if (!optionsRes.ok) {
        throw new Error(options.error || 'Failed to get passkey options');
      }

      const registrationResponse = await startRegistration({ optionsJSON: options });

      const verifyRes = await fetch('/api/admin/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationResponse, name: passkeyName }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || 'Failed to register passkey');
      }

      await fetchAdminSecurity();
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Passkey registration was cancelled');
        } else {
          setError(err.message || 'Failed to register passkey');
        }
      } else {
        setError('Failed to register passkey');
      }
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  const deleteAdminPasskey = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/auth/passkey?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete passkey');
      }
      await fetchAdminSecurity();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete passkey');
    }
  };

  const uploadRelease = async () => {
    try {
      setIsUploadingRelease(true);
      setError(null);

      if (!releaseFile) {
        throw new Error('Please choose a release file');
      }

      const fd = new FormData();
      fd.set('platform', releasePlatform);
      fd.set('file', releaseFile);
      if (releaseVersion.trim()) fd.set('version', releaseVersion.trim());
      if (releaseNotes.trim()) fd.set('releaseNotes', releaseNotes.trim());

      const res = await fetch('/api/admin/downloads/upload', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload release');
      }

      setTestEmailSuccess(`Release uploaded: v${data.version}`);
      setTimeout(() => setTestEmailSuccess(null), 5000);
      setReleaseFile(null);
      setReleasePlatform('macos');
      setReleaseVersion('');
      setReleaseNotes('');
      await fetchReleasesList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload release');
    } finally {
      setIsUploadingRelease(false);
    }
  };

  const saveReleaseNotes = async () => {
    try {
      setIsSavingReleaseNotes(true);
      setError(null);

      const version = editReleaseVersion.trim();
      if (!version) throw new Error('Choose a version to update');

      const res = await fetch('/api/admin/releases/update-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform: editReleasePlatform, version, releaseNotes: editReleaseNotes }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update release notes');

      setTestEmailSuccess(`Release notes updated: v${version}`);
      setTimeout(() => setTestEmailSuccess(null), 5000);
      await fetchReleasesList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update release notes');
    } finally {
      setIsSavingReleaseNotes(false);
    }
  };

  const sendTestReleaseEmail = async () => {
    try {
      setIsSendingTestEmail(true);
      setError(null);
      setTestEmailSuccess(null);

      const response = await fetch('/api/admin/settings/test-release-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: testEmailRecipient.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const details = data?.details?.message
          ? `: ${data.details.message}`
          : '';
        throw new Error(`${data.error || 'Failed to send test email'}${details}`);
      }

      setTestEmailSuccess(data.message || 'Test release email sent');
      setTimeout(() => setTestEmailSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test email');
    } finally {
      setIsSendingTestEmail(false);
    }
  };

  const sendTestWhatsApp = async () => {
    try {
      setIsSendingTestWhatsApp(true);
      setTestWhatsAppError(null);
      setTestWhatsAppSuccess(null);

      const response = await fetch('/api/admin/settings/test-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: testWhatsAppType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to send test notification');
      }

      setTestWhatsAppSuccess(data.message || 'Test notification sent');
      setTimeout(() => setTestWhatsAppSuccess(null), 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to send test notification';
      setTestWhatsAppError(msg);
    } finally {
      setIsSendingTestWhatsApp(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Settings</h1>
            <p className="text-text-secondary">Configure platform settings</p>
          </div>
          <Button variant="primary" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-green-500" />
            <span className="text-green-500">Settings saved successfully!</span>
          </motion.div>
        )}

        {testEmailSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-blue-500" />
            <span className="text-blue-500">{testEmailSuccess}</span>
          </motion.div>
        )}

        {testWhatsAppSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-green-500" />
            <span className="text-green-500">{testWhatsAppSuccess}</span>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3"
          >
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-500">{error}</span>
          </motion.div>
        )}

        <div className="space-y-6">
          {/* General Settings */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent-primary/20 rounded-lg">
                <Globe className="w-5 h-5 text-accent-primary" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">General</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <Input
                label="Site Name"
                value={settings.siteName}
                onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
              />
              <Input
                label="Site URL"
                value={settings.siteUrl}
                onChange={(e) => setSettings({ ...settings, siteUrl: e.target.value })}
              />
              <Input
                label="Support Email"
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                icon={<Mail className="w-5 h-5" />}
              />
            </div>
          </Card>

          {/* Help Page */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-background-tertiary rounded-lg">
                <HelpCircle className="w-5 h-5 text-text-secondary" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Help Page</h2>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-text-secondary">
                Content shown to users at <span className="font-medium">/dashboard/help</span>.
              </p>
              <textarea
                value={settings.helpPageContent}
                onChange={(e) => setSettings({ ...settings, helpPageContent: e.target.value })}
                placeholder="Enter help content..."
                className="w-full min-h-[220px] bg-background-tertiary border border-border rounded-xl px-4 py-3 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
              />
              <p className="text-xs text-text-tertiary">Markdown is supported and rendered on the user Help page.</p>
            </div>
          </Card>

          {/* Registration Settings */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Shield className="w-5 h-5 text-purple-500" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Registration & Security</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Allow New Registrations</p>
                  <p className="text-sm text-text-secondary">
                    Enable or disable new user sign-ups
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({ ...settings, allowRegistration: !settings.allowRegistration })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.allowRegistration ? 'bg-accent-primary' : 'bg-background-secondary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.allowRegistration ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Require Email Verification</p>
                  <p className="text-sm text-text-secondary">
                    Users must verify their email before accessing the app
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      requireEmailVerification: !settings.requireEmailVerification,
                    })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.requireEmailVerification
                      ? 'bg-accent-primary'
                      : 'bg-background-secondary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.requireEmailVerification ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Maintenance Mode</p>
                  <p className="text-sm text-text-secondary">
                    Disable access to the app for all users except admins
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.maintenanceMode ? 'bg-amber-500' : 'bg-background-secondary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.maintenanceMode ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Send test release email</p>
                  <p className="text-sm text-text-secondary">
                    Send a test release notification to a specific recipient address
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-64">
                    <Input
                      label=""
                      type="email"
                      placeholder="you@yourdomain.com"
                      value={testEmailRecipient}
                      onChange={(e) => setTestEmailRecipient(e.target.value)}
                      icon={<Mail className="w-5 h-5" />}
                    />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={sendTestReleaseEmail}
                    disabled={isSendingTestEmail}
                  >
                    {isSendingTestEmail ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Mail className="w-4 h-4 mr-2" />
                    )}
                    Send Test Email
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-background-tertiary rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">Test WhatsApp notification</p>
                    <p className="text-sm text-text-secondary">
                      Send a test notification through Node-RED to verify the WhatsApp pipeline
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-48">
                      <select
                        value={testWhatsAppType}
                        onChange={(e) => setTestWhatsAppType(e.target.value)}
                        className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                      >
                        <option value="triage">Triage (Issue)</option>
                        <option value="security">Security Alert</option>
                        <option value="payment">Payment</option>
                        <option value="release">Release</option>
                        <option value="build-status">Build Status</option>
                        <option value="idea-popular">Popular Idea</option>
                      </select>
                    </div>
                    <Button
                      variant="secondary"
                      onClick={sendTestWhatsApp}
                      disabled={isSendingTestWhatsApp}
                    >
                      {isSendingTestWhatsApp ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <MessageSquare className="w-4 h-4 mr-2" />
                      )}
                      Send Test
                    </Button>
                  </div>
                </div>
                {testWhatsAppSuccess && (
                  <div className="flex items-center gap-2 text-sm text-green-500">
                    <Check className="w-4 h-4" />
                    <span>{testWhatsAppSuccess}</span>
                  </div>
                )}
                {testWhatsAppError && (
                  <div className="flex items-center gap-2 text-sm text-red-500">
                    <AlertCircle className="w-4 h-4" />
                    <span>{testWhatsAppError}</span>
                  </div>
                )}
                {isSendingTestWhatsApp && (
                  <p className="text-sm text-text-tertiary">Connecting to Node-RED (up to 10s)…</p>
                )}
              </div>

              <div className="p-4 bg-background-tertiary rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">Admin 2FA (Authenticator)</p>
                    <p className="text-sm text-text-secondary">
                      {admin2fa?.enabled
                        ? `Enabled • Backup codes remaining: ${admin2fa.backupCodesRemaining}`
                        : 'Disabled'}
                    </p>
                  </div>
                  {!admin2fa?.enabled ? (
                    <Button
                      variant="secondary"
                      onClick={startTotpSetup}
                      disabled={isSettingUpTotp}
                    >
                      {isSettingUpTotp ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Shield className="w-4 h-4 mr-2" />
                      )}
                      Set Up 2FA
                    </Button>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-40">
                        <Input
                          label=""
                          placeholder="123456"
                          value={totpDisableCode}
                          onChange={(e) => setTotpDisableCode(e.target.value)}
                        />
                      </div>
                      <Button
                        variant="secondary"
                        onClick={disableTotp}
                        disabled={isDisablingTotp}
                      >
                        {isDisablingTotp ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Shield className="w-4 h-4 mr-2" />
                        )}
                        Disable 2FA
                      </Button>
                    </div>
                  )}
                </div>

                {totpSetup && !admin2fa?.enabled && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="bg-background-secondary rounded-lg p-4">
                      <p className="text-sm text-text-secondary mb-3">
                        Scan this QR code with your authenticator app.
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={totpSetup.qrCode}
                        alt="2FA QR Code"
                        className="w-48 h-48 bg-white rounded"
                      />
                    </div>
                    <div className="bg-background-secondary rounded-lg p-4 space-y-3">
                      <p className="text-sm text-text-secondary">
                        Then enter the 6-digit code to enable 2FA.
                      </p>
                      <Input
                        label="Verification code"
                        placeholder="123456"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                      />
                      <Button
                        variant="primary"
                        onClick={enableTotp}
                        disabled={isEnablingTotp}
                      >
                        {isEnablingTotp ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Shield className="w-4 h-4 mr-2" />
                        )}
                        Enable 2FA
                      </Button>
                    </div>
                  </div>
                )}

                {adminBackupCodes && (
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-blue-500 font-medium mb-2">Backup Codes (save these now)</p>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm text-text-primary">
                      {adminBackupCodes.map((c) => (
                        <div key={c} className="bg-background-secondary rounded px-3 py-2">
                          {c}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 bg-background-tertiary rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">Admin Passkeys</p>
                    <p className="text-sm text-text-secondary">
                      {webAuthnSupported
                        ? `${adminPasskeys.length} registered`
                        : 'WebAuthn not supported (requires HTTPS or localhost)'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-56">
                      <Input
                        label=""
                        placeholder="Passkey name"
                        value={passkeyName}
                        onChange={(e) => setPasskeyName(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={registerAdminPasskey}
                      disabled={isRegisteringPasskey || !webAuthnSupported}
                    >
                      {isRegisteringPasskey ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Fingerprint className="w-4 h-4 mr-2" />
                      )}
                      Add Passkey
                    </Button>
                  </div>
                </div>

                {adminPasskeys.length > 0 ? (
                  <div className="space-y-2">
                    {adminPasskeys.map((pk) => (
                      <div
                        key={pk.id}
                        className="flex items-center justify-between bg-background-secondary rounded-lg px-4 py-3"
                      >
                        <div>
                          <p className="text-text-primary font-medium">{pk.name}</p>
                          <p className="text-xs text-text-tertiary">
                            Added {new Date(pk.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => deleteAdminPasskey(pk.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary">No passkeys registered yet.</p>
                )}
              </div>
            </div>
          </Card>

          {/* Subscription Settings */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Database className="w-5 h-5 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Subscription Defaults</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Max Team Size
                </label>
                <input
                  type="number"
                  min="1"
                  value={settings.maxTeamSize}
                  onChange={(e) =>
                    setSettings({ ...settings, maxTeamSize: parseInt(e.target.value) || 100 })
                  }
                  className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Trial Days
                </label>
                <input
                  type="number"
                  min="0"
                  value={settings.trialDays}
                  onChange={(e) =>
                    setSettings({ ...settings, trialDays: parseInt(e.target.value) || 14 })
                  }
                  className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
            </div>
          </Card>

          {/* Release Notification Settings */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Bell className="w-5 h-5 text-blue-500" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Release Notifications</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Email users on new app version</p>
                  <p className="text-sm text-text-secondary">
                    Automatically notify all registered users when a new release is uploaded
                  </p>
                </div>
                <button
                  onClick={() =>
                    setSettings({
                      ...settings,
                      notifyUsersOnNewVersion: !settings.notifyUsersOnNewVersion,
                    })
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.notifyUsersOnNewVersion
                      ? 'bg-accent-primary'
                      : 'bg-background-secondary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      settings.notifyUsersOnNewVersion ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-500/30">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold text-red-500">Danger Zone</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Clear All Sessions</p>
                  <p className="text-sm text-text-secondary">
                    Log out all users from all devices
                  </p>
                </div>
                <Button variant="secondary" className="border-red-500 text-red-500">
                  Clear Sessions
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg">
                <div>
                  <p className="font-medium text-text-primary">Purge Deleted Data</p>
                  <p className="text-sm text-text-secondary">
                    Permanently remove all soft-deleted data
                  </p>
                </div>
                <Button variant="secondary" className="border-red-500 text-red-500">
                  Purge Data
                </Button>
              </div>
            </div>
          </Card>

          {/* App Releases */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-accent-secondary/20 rounded-lg">
                <Fingerprint className="w-5 h-5 text-accent-secondary" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">App Releases</h2>
            </div>

            <div className="space-y-4">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    Platform
                  </label>
                  <select
                    value={releasePlatform}
                    onChange={(e) => setReleasePlatform(e.target.value as any)}
                    className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                  >
                    <option value="macos">macOS</option>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                    <option value="ios">iOS</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-2">
                    File
                  </label>
                  <input
                    type="file"
                    accept="*/*"
                    onChange={(e) => setReleaseFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <Input
                  label="Version (optional)"
                  value={releaseVersion}
                  onChange={(e) => setReleaseVersion(e.target.value)}
                  placeholder="(auto from release notes)"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Release notes (Markdown/plain text)
                </label>
                <textarea
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>

              <div className="flex items-center justify-between">
                <Button variant="primary" onClick={uploadRelease} disabled={isUploadingRelease}>
                  {isUploadingRelease ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Mail className="w-4 h-4 mr-2" />
                  )}
                  Upload New Version
                </Button>
                <Button variant="secondary" onClick={fetchReleasesList}>
                  Refresh List
                </Button>
              </div>

              <div className="pt-2">
                <p className="text-sm text-text-tertiary mb-2">Available releases</p>
                <div className="space-y-2">
                  {releasesList.length === 0 ? (
                    <p className="text-sm text-text-tertiary">No releases yet.</p>
                  ) : (
                    releasesList.map((r) => (
                      <div
                        key={`${r.platform}-${r.version}`}
                        className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-3"
                      >
                        <div>
                          <p className="text-text-primary font-medium">
                            {r.platform?.toUpperCase()} v{r.version}
                          </p>
                          <p className="text-xs text-text-tertiary">
                            {new Date(r.publishedAt).toLocaleString()} {r.createdBy ? `• ${r.createdBy}` : ''}
                          </p>
                        </div>
                        <a href={r.filePath} className="inline-flex" download>
                          <Button variant="secondary">Download</Button>
                        </a>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <p className="text-sm text-text-secondary mb-3">Edit release notes</p>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Platform
                    </label>
                    <select
                      value={editReleasePlatform}
                      onChange={(e) => {
                        const p = (e.target.value as any) || 'macos';
                        setEditReleasePlatform(p);
                        setEditReleaseVersion('');
                        setEditReleaseNotes('');
                      }}
                      className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="macos">macOS</option>
                      <option value="windows">Windows</option>
                      <option value="linux">Linux</option>
                      <option value="ios">iOS</option>
                    </select>

                    <label className="block text-sm font-medium text-text-secondary mb-2 mt-4">
                      Version
                    </label>
                    <select
                      value={editReleaseVersion}
                      onChange={(e) => {
                        const v = e.target.value;
                        setEditReleaseVersion(v);
                        const match = releasesList.find(
                          (r) => r.version === v && (r.platform || '').toLowerCase() === editReleasePlatform
                        );
                        setEditReleaseNotes(match?.releaseNotes || '');
                      }}
                      className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="">Select version…</option>
                      {releasesList
                        .filter((r) => (r.platform || '').toLowerCase() === editReleasePlatform)
                        .map((r) => (
                          <option key={`${r.platform}-${r.version}`} value={r.version}>
                            {r.version}
                          </option>
                        ))}
                    </select>
                    <p className="text-xs text-text-tertiary mt-2">
                      This updates the notes shown to users and stored alongside the archived release.
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Release notes
                    </label>
                    <textarea
                      value={editReleaseNotes}
                      onChange={(e) => setEditReleaseNotes(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <Button variant="secondary" onClick={saveReleaseNotes} disabled={isSavingReleaseNotes}>
                    {isSavingReleaseNotes ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4 mr-2" />
                    )}
                    Save Notes
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
