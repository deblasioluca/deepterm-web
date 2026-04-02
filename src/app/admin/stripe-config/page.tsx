'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  CreditCard,
  ExternalLink,
  Loader2,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Shield,
  RefreshCw,
  ToggleLeft,
  ToggleRight,
  Save,
  Trash2,
  Plus,
  Key,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface KeySetInfo {
  id: string;
  mode: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  secretKeyPrefix: string;
  publishableKeyPrefix: string;
  hasWebhookSecret: boolean;
  hasPriceIds: boolean;
}

interface StripeConfig {
  sandbox: boolean;
  mode: string;
  dashboardUrl: string;
  keyPrefix: string;
  publishablePrefix: string;
  envStatus: Record<string, boolean>;
  priceIds: Record<string, { monthly: string; yearly: string } | null>;
  keySets: KeySetInfo[];
  plans: Array<{
    key: string;
    name: string;
    price: number;
    monthlyPrice: number | null;
  }>;
}

type FormMode = 'sandbox' | 'production';

interface KeySetForm {
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  proMonthly: string;
  proYearly: string;
  teamMonthly: string;
  teamYearly: string;
  businessMonthly: string;
  businessYearly: string;
}

const emptyForm: KeySetForm = {
  secretKey: '',
  publishableKey: '',
  webhookSecret: '',
  proMonthly: '',
  proYearly: '',
  teamMonthly: '',
  teamYearly: '',
  businessMonthly: '',
  businessYearly: '',
};

export default function AdminStripeConfigPage() {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Key set form state
  const [showForm, setShowForm] = useState<FormMode | null>(null);
  const [form, setForm] = useState<KeySetForm>(emptyForm);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Stripe Configuration',
      summary: config
        ? `Stripe ${config.mode} mode — ${config.keySets.length} key set(s) saved`
        : 'Loading...',
      data: config ? {
        mode: config.mode,
        sandbox: config.sandbox,
        keySets: config.keySets.map((ks) => ({ mode: ks.mode, isActive: ks.isActive })),
      } : { loading: true },
    });
    return () => setPageContext(null);
  }, [config, setPageContext]);

  const fetchConfig = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await fetch('/api/admin/stripe-config');
      if (!res.ok) throw new Error('Failed to fetch Stripe config');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  async function handleAction(action: string, body: Record<string, unknown>) {
    try {
      setActionLoading(action);
      setActionMessage(null);
      const res = await fetch('/api/admin/stripe-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setActionMessage({ type: 'success', text: `${action} succeeded` });
      await fetchConfig();
    } catch (err) {
      setActionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Action failed' });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSaveKeySet(mode: FormMode) {
    const body: Record<string, unknown> = {
      action: 'save',
      mode,
      secretKey: form.secretKey,
      publishableKey: form.publishableKey,
      webhookSecret: form.webhookSecret || undefined,
      priceIds: {
        proMonthly: form.proMonthly || undefined,
        proYearly: form.proYearly || undefined,
        teamMonthly: form.teamMonthly || undefined,
        teamYearly: form.teamYearly || undefined,
        businessMonthly: form.businessMonthly || undefined,
        businessYearly: form.businessYearly || undefined,
      },
    };
    await handleAction(`Save ${mode}`, body);
    setShowForm(null);
    setForm(emptyForm);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  if (error || !config) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-red-500" />
        <span className="text-red-500">{error || 'Failed to load Stripe config'}</span>
      </div>
    );
  }

  const sandboxSet = config.keySets.find((ks) => ks.mode === 'sandbox');
  const productionSet = config.keySets.find((ks) => ks.mode === 'production');

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Stripe Configuration</h1>
            <p className="text-text-secondary">Manage Stripe keys, switch between sandbox and production</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={config.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-lg text-sm font-medium hover:bg-accent-primary/20 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Dashboard
            </a>
            <button
              onClick={fetchConfig}
              className="inline-flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary hover:bg-background-secondary transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Action Message */}
        {actionMessage && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${
            actionMessage.type === 'success'
              ? 'bg-green-500/10 border border-green-500/30 text-green-500'
              : 'bg-red-500/10 border border-red-500/30 text-red-500'
          }`}>
            {actionMessage.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
            <span className="text-sm">{actionMessage.text}</span>
          </div>
        )}

        {/* Mode Toggle Banner */}
        <Card className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl ${config.sandbox ? 'bg-amber-500/10' : 'bg-green-500/10'}`}>
                {config.sandbox ? (
                  <Shield className="w-6 h-6 text-amber-500" />
                ) : (
                  <CreditCard className="w-6 h-6 text-green-500" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-semibold text-text-primary">
                    {config.sandbox ? 'Sandbox (Test Mode)' : 'Production (Live Mode)'}
                  </h2>
                  <Badge variant={config.sandbox ? 'warning' : 'success'}>
                    {config.mode}
                  </Badge>
                </div>
                <p className="text-sm text-text-secondary mt-1">
                  {config.sandbox
                    ? 'Using Stripe test keys — no real charges will be made.'
                    : 'Using Stripe live keys — real charges will be processed.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {productionSet && (
                <button
                  onClick={() => handleAction('Switch to production', { action: 'switch', mode: 'production' })}
                  disabled={!config.sandbox || actionLoading !== null}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    config.sandbox
                      ? 'bg-green-500/10 text-green-500 hover:bg-green-500/20 border border-green-500/30'
                      : 'bg-background-tertiary text-text-tertiary cursor-not-allowed'
                  }`}
                >
                  {actionLoading === 'Switch to production' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleRight className="w-4 h-4" />}
                  Go Live
                </button>
              )}
              {sandboxSet && (
                <button
                  onClick={() => handleAction('Switch to sandbox', { action: 'switch', mode: 'sandbox' })}
                  disabled={config.sandbox || actionLoading !== null}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    !config.sandbox
                      ? 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border border-amber-500/30'
                      : 'bg-background-tertiary text-text-tertiary cursor-not-allowed'
                  }`}
                >
                  {actionLoading === 'Switch to sandbox' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ToggleLeft className="w-4 h-4" />}
                  Sandbox
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Saved Key Sets */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-text-primary">Saved Key Sets</h2>
            <div className="flex items-center gap-2">
              {!sandboxSet && (
                <button
                  onClick={() => { setShowForm('sandbox'); setForm(emptyForm); }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-lg text-xs font-medium hover:bg-amber-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Sandbox
                </button>
              )}
              {!productionSet && (
                <button
                  onClick={() => { setShowForm('production'); setForm(emptyForm); }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-500 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Production
                </button>
              )}
            </div>
          </div>

          {config.keySets.length === 0 ? (
            <div className="text-center py-8 text-text-tertiary">
              <Key className="w-8 h-8 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No key sets saved yet. Add sandbox or production keys to enable mode switching.</p>
              <p className="text-xs mt-1">Currently using environment variables as fallback.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {config.keySets.map((ks) => (
                <div
                  key={ks.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    ks.isActive
                      ? 'bg-accent-primary/5 border-accent-primary/30'
                      : 'bg-background-tertiary border-border'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${
                      ks.mode === 'sandbox' ? 'bg-amber-500/10' : 'bg-green-500/10'
                    }`}>
                      {ks.mode === 'sandbox' ? (
                        <Shield className="w-5 h-5 text-amber-500" />
                      ) : (
                        <CreditCard className="w-5 h-5 text-green-500" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-text-primary capitalize">{ks.mode}</span>
                        {ks.isActive && <Badge variant="success">Active</Badge>}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-xs text-text-tertiary">
                        <span>SK: <span className="font-mono">{ks.secretKeyPrefix}</span></span>
                        <span>PK: <span className="font-mono">{ks.publishableKeyPrefix}</span></span>
                        {ks.hasWebhookSecret && <span className="text-green-500">Webhook</span>}
                        {ks.hasPriceIds && <span className="text-green-500">Price IDs</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setShowForm(ks.mode as FormMode); setForm(emptyForm); }}
                      className="p-2 text-text-tertiary hover:text-text-primary transition-colors"
                      title="Edit"
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleAction(`Delete ${ks.mode}`, { action: 'delete', mode: ks.mode })}
                      disabled={actionLoading !== null}
                      className="p-2 text-text-tertiary hover:text-red-500 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Key Set Form */}
        {showForm && (
          <Card className="mb-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">
              {showForm === 'sandbox' ? 'Sandbox' : 'Production'} Key Set
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Secret Key *</label>
                  <input
                    type="password"
                    value={form.secretKey}
                    onChange={(e) => setForm({ ...form, secretKey: e.target.value })}
                    placeholder={showForm === 'sandbox' ? 'sk_test_...' : 'sk_live_...'}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-text-secondary mb-1">Publishable Key *</label>
                  <input
                    type="text"
                    value={form.publishableKey}
                    onChange={(e) => setForm({ ...form, publishableKey: e.target.value })}
                    placeholder={showForm === 'sandbox' ? 'pk_test_...' : 'pk_live_...'}
                    className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Webhook Secret</label>
                <input
                  type="password"
                  value={form.webhookSecret}
                  onChange={(e) => setForm({ ...form, webhookSecret: e.target.value })}
                  placeholder="whsec_..."
                  className="w-full px-3 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                />
              </div>

              <div>
                <h3 className="text-sm font-medium text-text-secondary mb-2">Price IDs (optional)</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(['pro', 'team', 'business'] as const).map((plan) => (
                    <div key={plan} className="space-y-2">
                      <p className="text-xs font-medium text-text-tertiary capitalize">{plan}</p>
                      <input
                        type="text"
                        value={form[`${plan}Monthly` as keyof KeySetForm]}
                        onChange={(e) => setForm({ ...form, [`${plan}Monthly`]: e.target.value })}
                        placeholder={`${plan} monthly price ID`}
                        className="w-full px-3 py-1.5 bg-background-tertiary border border-border rounded text-xs text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                      />
                      <input
                        type="text"
                        value={form[`${plan}Yearly` as keyof KeySetForm]}
                        onChange={(e) => setForm({ ...form, [`${plan}Yearly`]: e.target.value })}
                        placeholder={`${plan} yearly price ID`}
                        className="w-full px-3 py-1.5 bg-background-tertiary border border-border rounded text-xs text-text-primary font-mono placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => { setShowForm(null); setForm(emptyForm); }}
                  className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSaveKeySet(showForm)}
                  disabled={!form.secretKey || !form.publishableKey || actionLoading !== null}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save {showForm === 'sandbox' ? 'Sandbox' : 'Production'} Keys
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Environment Variables Status */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Environment Variables (Fallback)</h2>
          <p className="text-xs text-text-tertiary mb-3">
            These env vars are used as fallback when no DB key set is active.
          </p>
          <div className="space-y-2">
            {Object.entries(config.envStatus).map(([key, isSet]) => (
              <div
                key={key}
                className="flex items-center justify-between py-2 px-3 bg-background-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3">
                  {isSet ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-xs font-mono text-text-secondary">{key}</span>
                </div>
                <Badge variant={isSet ? 'success' : 'danger'}>
                  {isSet ? 'Set' : 'Missing'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Plans & Pricing */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Plan Pricing</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Plan</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Annual Price</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Monthly Price</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Monthly Price ID</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Yearly Price ID</th>
                </tr>
              </thead>
              <tbody>
                {config.plans.map((plan) => (
                  <tr
                    key={plan.key}
                    className="border-b border-border/50 last:border-0 hover:bg-background-tertiary/50"
                  >
                    <td className="py-3 px-4">
                      <span className="font-medium text-text-primary">{plan.name}</span>
                      <span className="text-xs text-text-tertiary ml-2">({plan.key})</span>
                    </td>
                    <td className="py-3 px-4 text-text-primary">
                      {plan.price === 0 ? 'Free' : `$${plan.price}/mo`}
                    </td>
                    <td className="py-3 px-4 text-text-primary">
                      {plan.monthlyPrice ? `$${plan.monthlyPrice}/mo` : '\u2014'}
                    </td>
                    <td className="py-3 px-4">
                      {config.priceIds[plan.key] ? (
                        <span className="text-xs font-mono text-text-secondary">
                          {config.priceIds[plan.key]!.monthly}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">N/A</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {config.priceIds[plan.key] ? (
                        <span className="text-xs font-mono text-text-secondary">
                          {config.priceIds[plan.key]!.yearly}
                        </span>
                      ) : (
                        <span className="text-xs text-text-tertiary">N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Sandbox Tips */}
        {config.sandbox && (
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-3">Sandbox Testing Tips</h2>
            <div className="space-y-2 text-sm text-text-secondary">
              <p>Use these test card numbers for sandbox transactions:</p>
              <div className="bg-background-tertiary rounded-lg p-4 font-mono text-xs space-y-1">
                <div><span className="text-green-500">Success:</span> 4242 4242 4242 4242</div>
                <div><span className="text-red-500">Decline:</span> 4000 0000 0000 0002</div>
                <div><span className="text-amber-500">3D Secure:</span> 4000 0025 0000 3155</div>
              </div>
              <p className="text-xs text-text-tertiary mt-2">
                Any future date for expiry, any 3-digit CVC, any billing ZIP code.
              </p>
            </div>
          </Card>
        )}
      </motion.div>
    </div>
  );
}
