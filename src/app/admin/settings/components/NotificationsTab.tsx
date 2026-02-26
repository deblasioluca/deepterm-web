'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { Bell, Mail, MessageSquare, Loader2, Check, AlertCircle, Save } from 'lucide-react';

export default function NotificationsTab() {
  const [notifyUsersOnNewVersion, setNotifyUsersOnNewVersion] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email test
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailSuccess, setTestEmailSuccess] = useState<string | null>(null);

  // WhatsApp test
  const [isSendingTestWhatsApp, setIsSendingTestWhatsApp] = useState(false);
  const [testWhatsAppType, setTestWhatsAppType] = useState('triage');
  const [testWhatsAppSuccess, setTestWhatsAppSuccess] = useState<string | null>(null);
  const [testWhatsAppError, setTestWhatsAppError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => setNotifyUsersOnNewVersion(data.notifyUsersOnNewVersion ?? false))
      .catch(console.error);
  }, []);

  const saveSettings = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(false);
      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifyUsersOnNewVersion }),
      });
      if (!response.ok) throw new Error('Failed to save settings');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
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
        body: JSON.stringify({ toEmail: testEmailRecipient.trim() || undefined }),
      });
      const data = await response.json();
      if (!response.ok) {
        const details = data?.details?.message ? `: ${data.details.message}` : '';
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
      if (!response.ok) throw new Error(data.message || data.error || 'Failed to send test notification');
      setTestWhatsAppSuccess(data.message || 'Test notification sent');
      setTimeout(() => setTestWhatsAppSuccess(null), 5000);
    } catch (err) {
      setTestWhatsAppError(err instanceof Error ? err.message : 'Failed to send test notification');
    } finally {
      setIsSendingTestWhatsApp(false);
    }
  };

  return (
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500">Settings saved!</span>
        </div>
      )}
      {testEmailSuccess && (
        <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-blue-500" />
          <span className="text-blue-500">{testEmailSuccess}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

      {/* Release Notifications */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Bell className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Release Notifications</h2>
        </div>
        <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
          <div>
            <p className="font-medium text-text-primary">Email users on new app version</p>
            <p className="text-sm text-text-secondary">Automatically notify all registered users when a new release is uploaded</p>
          </div>
          <button
            onClick={() => setNotifyUsersOnNewVersion(!notifyUsersOnNewVersion)}
            className={`relative w-12 h-6 rounded-full transition-colors ${notifyUsersOnNewVersion ? 'bg-accent-primary' : 'bg-background-secondary'}`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${notifyUsersOnNewVersion ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save
          </Button>
        </div>
      </Card>

      {/* Test Email */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Mail className="w-5 h-5 text-blue-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Test Email</h2>
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
          <Button variant="secondary" onClick={sendTestReleaseEmail} disabled={isSendingTestEmail}>
            {isSendingTestEmail ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Mail className="w-4 h-4 mr-2" />}
            Send Test Email
          </Button>
        </div>
      </Card>

      {/* Test WhatsApp */}
      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <MessageSquare className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Test WhatsApp (via Node-RED)</h2>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={testWhatsAppType}
              onChange={(e) => setTestWhatsAppType(e.target.value)}
              className="w-48 px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            >
              <option value="triage">Triage (Issue)</option>
              <option value="security">Security Alert</option>
              <option value="payment">Payment</option>
              <option value="release">Release</option>
              <option value="build-status">Build Status</option>
              <option value="idea-popular">Popular Idea</option>
            </select>
            <Button variant="secondary" onClick={sendTestWhatsApp} disabled={isSendingTestWhatsApp}>
              {isSendingTestWhatsApp ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <MessageSquare className="w-4 h-4 mr-2" />}
              Send Test
            </Button>
          </div>
          {testWhatsAppSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-500">
              <Check className="w-4 h-4" /><span>{testWhatsAppSuccess}</span>
            </div>
          )}
          {testWhatsAppError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" /><span>{testWhatsAppError}</span>
            </div>
          )}
          {isSendingTestWhatsApp && (
            <p className="text-sm text-text-tertiary">Connecting to Node-RED (up to 10s)...</p>
          )}
        </div>
      </Card>
    </div>
  );
}
