'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { Database, Loader2, Check, AlertCircle, Save } from 'lucide-react';

export default function BillingTab() {
  const [maxTeamSize, setMaxTeamSize] = useState(100);
  const [trialDays, setTrialDays] = useState(14);
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        setMaxTeamSize(data.maxTeamSize ?? 100);
        setTrialDays(data.trialDays ?? 14);
        setStripeWebhookSecret(data.stripeWebhookSecret ?? '');
      })
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
        body: JSON.stringify({ maxTeamSize, trialDays, stripeWebhookSecret }),
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

      <Card>
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-500/20 rounded-lg">
            <Database className="w-5 h-5 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-text-primary">Subscription Defaults</h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Max Team Size</label>
            <input
              type="number"
              min="1"
              value={maxTeamSize}
              onChange={(e) => setMaxTeamSize(parseInt(e.target.value) || 100)}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">Trial Days</label>
            <input
              type="number"
              min="0"
              value={trialDays}
              onChange={(e) => setTrialDays(parseInt(e.target.value) || 14)}
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-text-secondary mb-2">Stripe Webhook Secret</label>
            <input
              type="password"
              value={stripeWebhookSecret}
              onChange={(e) => setStripeWebhookSecret(e.target.value)}
              placeholder="whsec_..."
              className="w-full px-4 py-2.5 bg-background-tertiary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="primary" onClick={saveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}
