'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button } from '@/components/ui';
import { Database, Loader2, Check, AlertCircle, Save, RefreshCw, Trash2, Plus } from 'lucide-react';

type Offering = {
  key: string;
  interval: 'monthly' | 'yearly';
  stage: 'draft' | 'live';
  name: string;
  priceCents: number;
  currency: string;
  isActive: boolean;
};

export default function BillingTab() {
  const [maxTeamSize, setMaxTeamSize] = useState(100);
  const [trialDays, setTrialDays] = useState(14);
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Offerings state
  const [draftOfferings, setDraftOfferings] = useState<Offering[]>([]);
  const [liveOfferings, setLiveOfferings] = useState<Offering[]>([]);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [offeringsMessage, setOfferingsMessage] = useState<string | null>(null);

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

  const fetchOfferings = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/subscription-offerings');
      if (!res.ok) return;
      const data = await res.json();
      setDraftOfferings((data?.draft || []) as Offering[]);
      setLiveOfferings((data?.live || []) as Offering[]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchOfferings(); }, [fetchOfferings]);

  const updateDraftRow = (idx: number, patch: Partial<Offering>) => {
    setDraftOfferings(rows => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const addDraftOffering = () => {
    setDraftOfferings(rows => [...rows, { key: '', interval: 'monthly', stage: 'draft', name: '', priceCents: 0, currency: 'usd', isActive: true }]);
  };

  const removeDraftOffering = (idx: number) => {
    setDraftOfferings(rows => rows.filter((_, i) => i !== idx));
  };

  const saveDraft = async () => {
    try {
      setIsSavingDraft(true);
      setOfferingsMessage(null);
      const res = await fetch('/api/admin/subscription-offerings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: draftOfferings.map(o => ({ key: o.key, interval: o.interval, name: o.name, priceCents: o.priceCents, currency: o.currency, isActive: o.isActive })) }),
      });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Failed to save draft'); }
      setOfferingsMessage('Draft saved');
      setTimeout(() => setOfferingsMessage(null), 3000);
      await fetchOfferings();
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to save draft'); }
    finally { setIsSavingDraft(false); }
  };

  const deployDraft = async () => {
    try {
      setIsDeploying(true);
      setOfferingsMessage(null);
      const res = await fetch('/api/admin/subscription-offerings/deploy', { method: 'POST' });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error || 'Deploy failed'); }
      setOfferingsMessage('Deployed to live — changes are now visible to users');
      setTimeout(() => setOfferingsMessage(null), 5000);
      await fetchOfferings();
    } catch (err) { setError(err instanceof Error ? err.message : 'Deploy failed'); }
    finally { setIsDeploying(false); }
  };

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

      {/* Subscription Offerings — Draft + Deploy */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Subscription Offerings</h2>
            <p className="text-sm text-text-secondary">
              Edit draft offerings and deploy when ready. Users only see live offerings.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={addDraftOffering}>
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
            <Button variant="secondary" size="sm" onClick={saveDraft} disabled={isSavingDraft}>
              {isSavingDraft ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Draft
            </Button>
            <Button variant="primary" size="sm" onClick={deployDraft} disabled={isDeploying}>
              {isDeploying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Deploy
            </Button>
          </div>
        </div>

        {offeringsMessage && (
          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-blue-400 text-sm">
            {offeringsMessage}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Key</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Interval</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Name</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Price (¢)</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Currency</th>
                <th className="text-left py-2 px-3 text-xs font-medium text-text-secondary">Active</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {draftOfferings.map((o, idx) => (
                <tr key={`${o.key}-${idx}`} className="border-b border-border/50 last:border-0">
                  <td className="py-2 px-3"><input value={o.key} onChange={e => updateDraftRow(idx, { key: e.target.value })} className="w-28 px-2 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary" /></td>
                  <td className="py-2 px-3"><select value={o.interval} onChange={e => updateDraftRow(idx, { interval: e.target.value as 'monthly' | 'yearly' })} className="px-2 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary"><option value="monthly">monthly</option><option value="yearly">yearly</option></select></td>
                  <td className="py-2 px-3"><input value={o.name} onChange={e => updateDraftRow(idx, { name: e.target.value })} className="w-40 px-2 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary" /></td>
                  <td className="py-2 px-3"><input type="number" value={o.priceCents} onChange={e => updateDraftRow(idx, { priceCents: parseInt(e.target.value || '0', 10) })} className="w-28 px-2 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary" /></td>
                  <td className="py-2 px-3"><input value={o.currency} onChange={e => updateDraftRow(idx, { currency: e.target.value })} className="w-16 px-2 py-1.5 bg-background-tertiary border border-border rounded text-sm text-text-primary focus:outline-none focus:border-accent-primary" /></td>
                  <td className="py-2 px-3"><input type="checkbox" checked={o.isActive} onChange={e => updateDraftRow(idx, { isActive: e.target.checked })} /></td>
                  <td className="py-2 px-3 text-right"><button onClick={() => removeDraftOffering(idx)} className="p-1 text-red-400 hover:bg-red-500/10 rounded transition"><Trash2 className="w-3.5 h-3.5" /></button></td>
                </tr>
              ))}
              {draftOfferings.length === 0 && (
                <tr><td colSpan={7} className="py-4 px-3 text-sm text-text-tertiary text-center">No draft offerings — click Add to create one.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 text-xs text-text-tertiary">
          Live offerings: {liveOfferings.filter(o => o.isActive).length} active
        </div>
      </Card>
    </div>
  );
}
