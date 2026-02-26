'use client';

import { useState, useEffect } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { Globe, Mail, HelpCircle, Loader2, Check, AlertCircle, Save } from 'lucide-react';

interface GeneralSettings {
  siteName: string;
  siteUrl: string;
  supportEmail: string;
  helpPageContent: string;
  maintenanceMode: boolean;
}

export default function GeneralTab() {
  const [settings, setSettings] = useState<GeneralSettings>({
    siteName: 'DeepTerm',
    siteUrl: 'https://deepterm.net',
    supportEmail: 'support@deepterm.net',
    helpPageContent: '',
    maintenanceMode: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .catch(err => console.error('Failed to fetch settings:', err))
      .finally(() => setIsLoading(false));
  }, []);

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
      if (!response.ok) throw new Error('Failed to save settings');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
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
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500">Settings saved successfully!</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

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

        <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg mt-6">
          <div>
            <p className="font-medium text-text-primary">Maintenance Mode</p>
            <p className="text-sm text-text-secondary">Disable access for all users except admins</p>
          </div>
          <button
            onClick={() => setSettings({ ...settings, maintenanceMode: !settings.maintenanceMode })}
            className={`relative w-12 h-6 rounded-full transition-colors ${
              settings.maintenanceMode ? 'bg-amber-500' : 'bg-background-secondary'
            }`}
          >
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
              settings.maintenanceMode ? 'left-7' : 'left-1'
            }`} />
          </button>
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

      <div className="flex justify-end">
        <Button variant="primary" onClick={saveSettings} disabled={isSaving}>
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
