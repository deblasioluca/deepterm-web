'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface StripeConfig {
  sandbox: boolean;
  mode: string;
  dashboardUrl: string;
  keyPrefix: string;
  publishablePrefix: string;
  envStatus: Record<string, boolean>;
  priceIds: Record<string, { monthly: string; yearly: string } | null>;
  plans: Array<{
    key: string;
    name: string;
    price: number;
    monthlyPrice: number | null;
  }>;
}

export default function AdminStripeConfigPage() {
  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setPageContext } = useAdminAI();

  useEffect(() => {
    setPageContext({
      page: 'Stripe Configuration',
      summary: config
        ? `Stripe ${config.mode} mode — ${Object.values(config.envStatus).filter(Boolean).length}/${Object.keys(config.envStatus).length} env vars set`
        : 'Loading...',
      data: config ? {
        mode: config.mode,
        sandbox: config.sandbox,
        envVarsSet: Object.entries(config.envStatus)
          .filter(([, v]) => v)
          .map(([k]) => k),
        envVarsMissing: Object.entries(config.envStatus)
          .filter(([, v]) => !v)
          .map(([k]) => k),
      } : { loading: true },
    });
    return () => setPageContext(null);
  }, [config, setPageContext]);

  useEffect(() => {
    fetchConfig();
  }, []);

  async function fetchConfig() {
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

  const envVarLabels: Record<string, string> = {
    STRIPE_SECRET_KEY: 'Secret Key',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'Publishable Key',
    STRIPE_WEBHOOK_SECRET: 'Webhook Secret',
    STRIPE_PRO_MONTHLY_PRICE_ID: 'Pro Monthly Price',
    STRIPE_PRO_YEARLY_PRICE_ID: 'Pro Yearly Price',
    STRIPE_TEAM_MONTHLY_PRICE_ID: 'Team Monthly Price',
    STRIPE_TEAM_YEARLY_PRICE_ID: 'Team Yearly Price',
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: 'Business Monthly Price',
    STRIPE_BUSINESS_YEARLY_PRICE_ID: 'Business Yearly Price',
  };

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
            <p className="text-text-secondary">View Stripe environment status and price configuration</p>
          </div>
          <button
            onClick={fetchConfig}
            className="inline-flex items-center gap-2 px-4 py-2 bg-background-tertiary border border-border rounded-lg text-sm text-text-primary hover:bg-background-secondary transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        {/* Mode Banner */}
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
                    ? 'Using Stripe test keys — no real charges will be made. Use test card 4242 4242 4242 4242.'
                    : 'Using Stripe live keys — real charges will be processed.'}
                </p>
              </div>
            </div>
            <a
              href={config.dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent-primary/10 text-accent-primary rounded-lg text-sm font-medium hover:bg-accent-primary/20 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open Stripe Dashboard
            </a>
          </div>
        </Card>

        {/* How to Switch */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-3">Switching Modes</h2>
          <p className="text-sm text-text-secondary mb-4">
            To switch between sandbox and production, update the following environment variables and restart the server:
          </p>
          <div className="bg-background-tertiary rounded-lg p-4 font-mono text-sm text-text-secondary">
            <div className="mb-1">
              <span className="text-text-tertiary"># For sandbox (test mode):</span>
            </div>
            <div className="mb-1">STRIPE_SECRET_KEY=sk_test_...</div>
            <div className="mb-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...</div>
            <div className="mb-4">STRIPE_WEBHOOK_SECRET=whsec_...</div>
            <div className="mb-1">
              <span className="text-text-tertiary"># For production (live mode):</span>
            </div>
            <div className="mb-1">STRIPE_SECRET_KEY=sk_live_...</div>
            <div className="mb-1">NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...</div>
            <div>STRIPE_WEBHOOK_SECRET=whsec_...</div>
          </div>
          <p className="text-xs text-text-tertiary mt-3">
            Price IDs are different between test and live mode. Make sure to update all STRIPE_*_PRICE_ID variables when switching.
          </p>
        </Card>

        {/* Environment Variables Status */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Environment Variables</h2>
          <div className="space-y-3">
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
                  <div>
                    <span className="text-sm font-medium text-text-primary">
                      {envVarLabels[key] || key}
                    </span>
                    <span className="text-xs text-text-tertiary ml-2 font-mono">{key}</span>
                  </div>
                </div>
                <Badge variant={isSet ? 'success' : 'danger'}>
                  {isSet ? 'Set' : 'Missing'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        {/* Key Prefixes */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Key Prefixes</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-background-tertiary rounded-lg">
              <p className="text-xs text-text-tertiary mb-1">Secret Key</p>
              <p className="text-sm font-mono text-text-primary">{config.keyPrefix}</p>
            </div>
            <div className="p-4 bg-background-tertiary rounded-lg">
              <p className="text-xs text-text-tertiary mb-1">Publishable Key</p>
              <p className="text-sm font-mono text-text-primary">{config.publishablePrefix}</p>
            </div>
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
                      {plan.monthlyPrice ? `$${plan.monthlyPrice}/mo` : '—'}
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
                <div><span className="text-blue-500">PayPal:</span> Use sandbox PayPal account</div>
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
