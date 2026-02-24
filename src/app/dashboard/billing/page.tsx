'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Badge, Modal } from '@/components/ui';
import {
  CreditCard,
  Download,
  Check,
  Zap,
  Users,
  Calendar,
  FileText,
  AlertCircle,
  Loader2,
  ExternalLink,
  RefreshCw,
  Trash2,
  Plus,
  Star,
} from 'lucide-react';

interface PaymentMethodData {
  id: string;
  stripeId: string;
  type: string;
  brand: string | null;
  last4: string | null;
  expMonth: number | null;
  expYear: number | null;
  email: string | null;
  walletType: string | null;
  isDefault: boolean;
}

interface SubscriptionData {
  subscription: {
    status: string;
    currentPeriodEnd: string;
    currentPeriodStart: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  plan: string;
  seats: number;
  usedSeats: number;
  members: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
  }>;
  invoices: Array<{
    id: string;
    stripeInvoiceId: string;
    amountPaid: number;
    currency: string;
    status: string;
    invoicePdf: string | null;
    periodStart: string;
    periodEnd: string;
    createdAt: string;
  }>;
  paymentMethod: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  } | null;
}

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    price: 0,
    features: ['5 hosts', 'Basic terminal', 'Single device'],
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 12.99,
    yearlyPrice: 10,
    features: ['Unlimited hosts', 'AI assistant', 'Team vaults', 'All devices'],
  },
  {
    id: 'team',
    name: 'Team',
    monthlyPrice: 24.99,
    yearlyPrice: 20,
    features: ['Everything in Pro', 'SSO/SAML', 'Admin controls', 'Audit logs'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    features: ['Custom deployment', 'Dedicated support', 'SLA guarantee'],
  },
];

const planFeatures: Record<string, string[]> = {
  starter: ['5 hosts', 'Basic terminal', 'Single device', 'Local vault'],
  pro: [
    'Unlimited hosts',
    'AI terminal assistant',
    'Cloud encrypted vault',
    'All devices',
    'SFTP client',
    'Port forwarding',
    'Priority support',
  ],
  team: [
    'Everything in Pro',
    'Team vaults',
    'MultiKey',
    'Real-time collaboration',
    'SSO/SAML',
    'Admin controls',
    'Audit logs',
  ],
  enterprise: [
    'Everything in Team',
    'Multiple shared vaults',
    'SOC2 report',
    'Enterprise SSO',
    'Dedicated support',
    'SLA guarantee',
  ],
};

// Helper function to get payment method display info
function getPaymentMethodDisplay(method: PaymentMethodData) {
  const brandColors: Record<string, string> = {
    visa: 'from-blue-600 to-blue-400',
    mastercard: 'from-red-500 to-orange-400',
    amex: 'from-blue-700 to-blue-500',
    discover: 'from-orange-500 to-orange-400',
    paypal: 'from-[#0070BA] to-[#003087]',
    link: 'from-green-500 to-teal-400',
    apple_pay: 'from-gray-900 to-gray-700',
    google_pay: 'from-blue-500 to-red-500',
  };

  const brandIcons: Record<string, string> = {
    visa: 'VISA',
    mastercard: 'MC',
    amex: 'AMEX',
    discover: 'DISC',
    paypal: 'PayPal',
    link: 'Link',
    apple_pay: '',
    google_pay: 'G Pay',
  };

  const brand = method.walletType || method.brand || method.type;
  const gradient = brandColors[brand?.toLowerCase() || ''] || 'from-gray-600 to-gray-400';
  const icon = brandIcons[brand?.toLowerCase() || ''] || brand?.toUpperCase() || 'CARD';

  let displayText = '';
  let subText = '';

  if (method.type === 'card') {
    displayText = method.last4 ? `•••• •••• •••• ${method.last4}` : 'Card';
    subText = method.expMonth && method.expYear ? `Expires ${method.expMonth}/${method.expYear}` : '';
    if (method.walletType === 'apple_pay') {
      displayText = `Apple Pay (${method.last4 || 'Card'})`;
    } else if (method.walletType === 'google_pay') {
      displayText = `Google Pay (${method.last4 || 'Card'})`;
    }
  } else if (method.type === 'paypal') {
    displayText = method.email || 'PayPal';
    subText = 'PayPal Account';
  } else if (method.type === 'link') {
    displayText = method.email || 'Link';
    subText = 'Stripe Link';
  } else {
    displayText = method.brand || method.type || 'Payment Method';
  }

  return { gradient, icon, displayText, subText };
}

// Payment Method Card Component
function PaymentMethodCard({ 
  method, 
  compact = false,
  onSetDefault,
  onRemove,
  showActions = false,
}: { 
  method: PaymentMethodData;
  compact?: boolean;
  onSetDefault?: (id: string) => void;
  onRemove?: (id: string) => void;
  showActions?: boolean;
}) {
  const { gradient, icon, displayText, subText } = getPaymentMethodDisplay(method);

  return (
    <div className={`flex items-center gap-4 p-4 bg-background-tertiary rounded-lg ${compact ? '' : 'hover:bg-background-secondary transition-colors'}`}>
      <div className={`w-12 h-8 bg-gradient-to-r ${gradient} rounded flex items-center justify-center flex-shrink-0`}>
        {method.walletType === 'apple_pay' ? (
          <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.53 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
        ) : (
          <span className="text-white text-xs font-bold">{icon}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-text-primary truncate">{displayText}</p>
          {method.isDefault && (
            <Badge variant="primary" className="text-xs">Default</Badge>
          )}
        </div>
        {subText && <p className="text-sm text-text-secondary">{subText}</p>}
      </div>
      {showActions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {!method.isDefault && onSetDefault && (
            <Button variant="ghost" size="sm" onClick={() => onSetDefault(method.id)} title="Set as default">
              <Star className="w-4 h-4" />
            </Button>
          )}
          {onRemove && (
            <Button variant="ghost" size="sm" onClick={() => onRemove(method.id)} className="text-red-500 hover:text-red-400" title="Remove">
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  const [isChangePlanOpen, setIsChangePlanOpen] = useState(false);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isPaymentMethodsOpen, setIsPaymentMethodsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [data, setData] = useState<SubscriptionData | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodData[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('yearly');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      setSuccessMessage('Your subscription has been updated successfully!');
      window.history.replaceState({}, '', '/dashboard/billing');
    } else if (params.get('canceled') === 'true') {
      setError('Checkout was canceled.');
      window.history.replaceState({}, '', '/dashboard/billing');
    } else if (params.get('setup') === 'success') {
      setSuccessMessage('Payment method added successfully!');
      window.history.replaceState({}, '', '/dashboard/billing');
    } else if (params.get('setup') === 'canceled') {
      setError('Payment method setup was canceled.');
      window.history.replaceState({}, '', '/dashboard/billing');
    }
  }, []);

  const fetchSubscriptionData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/stripe/subscription');
      if (!response.ok) throw new Error('Failed to fetch subscription data');
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      const response = await fetch('/api/stripe/payment-methods');
      if (!response.ok) throw new Error('Failed to fetch payment methods');
      const result = await response.json();
      setPaymentMethods(result.paymentMethods || []);
    } catch (err) {
      console.error('Failed to fetch payment methods:', err);
    }
  }, []);

  useEffect(() => {
    fetchSubscriptionData();
    fetchPaymentMethods();
  }, [fetchSubscriptionData, fetchPaymentMethods]);

  const handleAddPaymentMethod = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to setup payment method');
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment method');
      setIsActionLoading(false);
    }
  };

  const handleSetDefaultPaymentMethod = async (paymentMethodId: string) => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/payment-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethodId, action: 'set_default' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to set default');
      setSuccessMessage('Default payment method updated');
      fetchPaymentMethods();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update payment method');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRemovePaymentMethod = async (paymentMethodId: string) => {
    if (!confirm('Are you sure you want to remove this payment method?')) return;
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch(`/api/stripe/payment-methods?id=${paymentMethodId}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to remove');
      setSuccessMessage('Payment method removed');
      fetchPaymentMethods();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove payment method');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleUpgrade = async (plan: string) => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billingPeriod, seats: data?.seats || 1 }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to create checkout');
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start checkout');
      setIsActionLoading(false);
    }
  };

  const handleManageBilling = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/portal', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to open portal');
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open billing portal');
      setIsActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to cancel');
      setSuccessMessage(result.message);
      setIsCancelOpen(false);
      fetchSubscriptionData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel subscription');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleResumeSubscription = async () => {
    try {
      setIsActionLoading(true);
      setError(null);
      const response = await fetch('/api/stripe/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to resume');
      setSuccessMessage(result.message);
      fetchSubscriptionData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume subscription');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (!selectedPlan || selectedPlan === data?.plan) {
      setIsChangePlanOpen(false);
      return;
    }
    if (!data?.subscription || data.plan === 'starter') {
      await handleUpgrade(selectedPlan);
    } else {
      try {
        setIsActionLoading(true);
        setError(null);
        const response = await fetch('/api/stripe/subscription', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'change_plan', plan: selectedPlan, billingPeriod }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to change plan');
        setSuccessMessage(result.message);
        setIsChangePlanOpen(false);
        fetchSubscriptionData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to change plan');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-5xl flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  const currentPlan = data?.plan || 'starter';
  const currentPlanDetails = plans.find((p) => p.id === currentPlan) || plans[0];
  const features = planFeatures[currentPlan] || [];

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Billing</h1>
            <p className="text-text-secondary">Manage your subscription and payment methods</p>
          </div>
          <Button variant="ghost" onClick={fetchSubscriptionData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3"
          >
            <Check className="w-5 h-5 text-green-500" />
            <span className="text-green-500">{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="ml-auto text-green-500/70 hover:text-green-500">×</button>
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
            <button onClick={() => setError(null)} className="ml-auto text-red-500/70 hover:text-red-500">×</button>
          </motion.div>
        )}

        <Card className="mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-accent-primary/20 rounded-xl">
                <Zap className="w-6 h-6 text-accent-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-text-primary">{currentPlanDetails.name} Plan</h2>
                  <Badge variant="primary">Current</Badge>
                  {data?.subscription?.cancelAtPeriodEnd && <Badge variant="warning">Canceling</Badge>}
                  {data?.subscription?.status === 'past_due' && <Badge variant="danger">Past Due</Badge>}
                </div>
                <p className="text-text-secondary">
                  {currentPlan === 'starter' ? 'Free forever' : (
                    billingPeriod === 'yearly' ? (
                      <>
                        ${(currentPlanDetails as any).yearlyPrice}/user/month • <span className="text-accent-primary font-medium">${(currentPlanDetails as any).yearlyPrice * 12}/year</span>
                        <span className="text-green-400 ml-2">
                          (Save ${(((currentPlanDetails as any).monthlyPrice - (currentPlanDetails as any).yearlyPrice) * 12).toFixed(0)}/year)
                        </span>
                      </>
                    ) : (
                      <>${(currentPlanDetails as any).monthlyPrice}/user/month</>
                    )
                  )}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => { setSelectedPlan(currentPlan); setIsChangePlanOpen(true); }}>
              {currentPlan === 'starter' ? 'Upgrade' : 'Change Plan'}
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-secondary">Team Seats</span>
              </div>
              <div className="flex items-end gap-2">
                <span className="text-2xl font-bold text-text-primary">{data?.usedSeats || 0}</span>
                <span className="text-text-secondary mb-1">/ {data?.seats || 1} seats used</span>
              </div>
              {(data?.seats || 0) > 0 && (
                <div className="mt-3 h-2 bg-background-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-accent-primary rounded-full transition-all" style={{ width: `${Math.min(((data?.usedSeats || 0) / (data?.seats || 1)) * 100, 100)}%` }} />
                </div>
              )}
            </div>

            <div className="p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-text-tertiary" />
                <span className="text-sm font-medium text-text-secondary">
                  {data?.subscription?.cancelAtPeriodEnd ? 'Access Until' : 'Next Billing Date'}
                </span>
              </div>
              <p className="text-2xl font-bold text-text-primary">
                {data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
              </p>
              {data?.subscription && !data.subscription.cancelAtPeriodEnd && (
                <p className="text-sm text-text-secondary mt-1">
                  Est. charge: ${billingPeriod === 'yearly' 
                    ? ((currentPlanDetails as any).yearlyPrice * 12 * (data?.seats || 1)).toFixed(2)
                    : ((currentPlanDetails as any).monthlyPrice * (data?.seats || 1)).toFixed(2)
                  }
                  {billingPeriod === 'yearly' && <span className="text-text-tertiary"> (billed annually)</span>}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-border">
            <h3 className="text-sm font-medium text-text-secondary mb-3">Plan Features</h3>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-accent-secondary" />
                  <span className="text-text-primary">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-primary/20 rounded-lg">
                <CreditCard className="w-5 h-5 text-accent-primary" />
              </div>
              <h2 className="text-lg font-semibold text-text-primary">Payment Methods</h2>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handleAddPaymentMethod} disabled={isActionLoading}>
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add</>}
              </Button>
              {paymentMethods.length > 0 && (
                <Button variant="ghost" onClick={() => setIsPaymentMethodsOpen(true)}>
                  Manage
                </Button>
              )}
            </div>
          </div>

          {paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.slice(0, 2).map((pm) => (
                <PaymentMethodCard key={pm.id} method={pm} compact />
              ))}
              {paymentMethods.length > 2 && (
                <button
                  onClick={() => setIsPaymentMethodsOpen(true)}
                  className="text-sm text-accent-primary hover:underline"
                >
                  + {paymentMethods.length - 2} more payment methods
                </button>
              )}
            </div>
          ) : (
            <div className="p-6 bg-background-tertiary rounded-lg text-center">
              <div className="flex justify-center gap-4 mb-4">
                <div className="w-12 h-8 bg-gradient-to-r from-gray-700 to-gray-600 rounded flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-white" />
                </div>
                <div className="w-12 h-8 bg-[#0070BA] rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold">Pay</span>
                </div>
                <div className="w-12 h-8 bg-black rounded flex items-center justify-center">
                  <span className="text-white text-xs font-bold"></span>
                </div>
              </div>
              <p className="text-text-secondary mb-4">
                {currentPlan === 'starter' ? 'Upgrade to add a payment method' : 'Add a payment method to get started'}
              </p>
              <p className="text-xs text-text-tertiary">
                We accept Credit Cards, Apple Pay, Google Pay, PayPal, and Link
              </p>
            </div>
          )}
        </Card>

        <Card className="mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <FileText className="w-5 h-5 text-accent-primary" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">Billing History</h2>
          </div>

          {data?.invoices && data.invoices.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Invoice</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Date</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Amount</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                    <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 px-4 font-medium text-text-primary">{invoice.stripeInvoiceId.slice(-8).toUpperCase()}</td>
                      <td className="py-3 px-4 text-text-secondary">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                      <td className="py-3 px-4 text-text-primary">${(invoice.amountPaid / 100).toFixed(2)} {invoice.currency.toUpperCase()}</td>
                      <td className="py-3 px-4"><Badge variant={invoice.status === 'paid' ? 'success' : 'warning'}>{invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}</Badge></td>
                      <td className="py-3 px-4 text-right">
                        {invoice.invoicePdf && (
                          <a href={invoice.invoicePdf} target="_blank" rel="noopener noreferrer">
                            <Button variant="ghost" size="sm"><Download className="w-4 h-4" /></Button>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center"><p className="text-text-secondary">No invoices yet</p></div>
          )}
        </Card>

        {data?.subscription && currentPlan !== 'starter' && (
          <Card className={data.subscription.cancelAtPeriodEnd ? 'border-accent-secondary/30' : 'border-accent-danger/30'}>
            <div className="flex items-center justify-between">
              {data.subscription.cancelAtPeriodEnd ? (
                <>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-1">Subscription Scheduled for Cancellation</h3>
                    <p className="text-sm text-text-secondary">
                      Your access will end on {new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </p>
                  </div>
                  <Button variant="primary" onClick={handleResumeSubscription} disabled={isActionLoading}>
                    {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resume Subscription'}
                  </Button>
                </>
              ) : (
                <>
                  <div>
                    <h3 className="font-semibold text-text-primary mb-1">Cancel Subscription</h3>
                    <p className="text-sm text-text-secondary">Your subscription will remain active until the end of the billing period</p>
                  </div>
                  <Button variant="secondary" className="border-accent-danger text-accent-danger hover:bg-accent-danger/10" onClick={() => setIsCancelOpen(true)}>Cancel Plan</Button>
                </>
              )}
            </div>
          </Card>
        )}
      </motion.div>

      <Modal isOpen={isChangePlanOpen} onClose={() => setIsChangePlanOpen(false)} title="Change Plan" description="Select a new plan for your team">
        <div className="mb-4">
          <div className="flex bg-background-tertiary rounded-lg p-1">
            <button className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${billingPeriod === 'monthly' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary'}`} onClick={() => setBillingPeriod('monthly')}>Monthly</button>
            <button className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${billingPeriod === 'yearly' ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary'}`} onClick={() => setBillingPeriod('yearly')}>Yearly <span className="text-accent-secondary ml-1">Save 20%</span></button>
          </div>
        </div>

        <div className="space-y-3">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedPlan === plan.id ? 'border-accent-primary bg-accent-primary/10' : plan.id === currentPlan ? 'border-accent-secondary/50 bg-accent-secondary/5' : 'border-border hover:border-accent-primary/50'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold text-text-primary">{plan.name}</h4>
                  {plan.id === currentPlan && <Badge variant="secondary">Current</Badge>}
                </div>
                <div className="text-right">
                  <span className="font-bold text-text-primary">
                    {plan.price === null ? 'Custom' : plan.price === 0 ? 'Free' : billingPeriod === 'yearly' ? `$${(plan as any).yearlyPrice}/mo` : `$${(plan as any).monthlyPrice}/mo`}
                  </span>
                  {plan.price !== null && plan.price !== 0 && billingPeriod === 'yearly' && (
                    <p className="text-xs text-text-tertiary">${(plan as any).yearlyPrice * 12}/year</p>
                  )}
                </div>
              </div>
              {plan.price !== null && plan.price !== 0 && billingPeriod === 'yearly' && (
                <p className="text-xs text-green-400 mb-2">
                  Save ${(((plan as any).monthlyPrice - (plan as any).yearlyPrice) * 12).toFixed(0)}/year vs monthly
                </p>
              )}
              <ul className="space-y-1">
                {plan.features.map((feature) => (
                  <li key={feature} className="text-sm text-text-secondary flex items-center gap-2">
                    <Check className="w-3 h-3 text-accent-secondary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex gap-3 pt-6">
          <Button variant="secondary" className="flex-1" onClick={() => setIsChangePlanOpen(false)}>Cancel</Button>
          <Button variant="primary" className="flex-1" onClick={handleChangePlan} disabled={isActionLoading || !selectedPlan || selectedPlan === currentPlan || selectedPlan === 'enterprise'}>
            {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : selectedPlan === 'enterprise' ? 'Contact Sales' : 'Confirm Change'}
          </Button>
        </div>
      </Modal>

      <Modal isOpen={isCancelOpen} onClose={() => setIsCancelOpen(false)} title="Cancel Subscription" description="Are you sure you want to cancel?">
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-500">Before you go...</p>
              <p className="text-sm text-text-secondary mt-1">You&apos;ll lose access to team features, AI assistant, and all stored credentials will be archived.</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-text-secondary">Your subscription will remain active until:</p>
            <p className="font-semibold text-text-primary">
              {data?.subscription?.currentPeriodEnd ? new Date(data.subscription.currentPeriodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" className="flex-1" onClick={() => setIsCancelOpen(false)}>Keep Subscription</Button>
            <Button variant="secondary" className="flex-1 border-accent-danger text-accent-danger hover:bg-accent-danger/10" onClick={handleCancelSubscription} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Cancel Anyway'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isPaymentMethodsOpen} onClose={() => setIsPaymentMethodsOpen(false)} title="Payment Methods" description="Manage your payment methods">
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-secondary">
              We accept Credit Cards, Apple Pay, Google Pay, PayPal, and Stripe Link
            </p>
            <Button variant="primary" size="sm" onClick={handleAddPaymentMethod} disabled={isActionLoading}>
              {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-1" /> Add New</>}
            </Button>
          </div>

          {paymentMethods.length > 0 ? (
            <div className="space-y-3">
              {paymentMethods.map((pm) => (
                <PaymentMethodCard
                  key={pm.id}
                  method={pm}
                  showActions
                  onSetDefault={handleSetDefaultPaymentMethod}
                  onRemove={handleRemovePaymentMethod}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center bg-background-tertiary rounded-lg">
              <CreditCard className="w-12 h-12 text-text-tertiary mx-auto mb-4" />
              <p className="text-text-secondary mb-4">No payment methods added yet</p>
              <Button variant="primary" onClick={handleAddPaymentMethod} disabled={isActionLoading}>
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Payment Method'}
              </Button>
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <div className="flex justify-center gap-6">
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <svg className="w-8 h-5" viewBox="0 0 32 20" fill="currentColor">
                  <rect width="32" height="20" rx="2" fill="#1A1F71"/>
                  <text x="16" y="13" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">VISA</text>
                </svg>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <svg className="w-8 h-5" viewBox="0 0 32 20" fill="currentColor">
                  <rect width="32" height="20" rx="2" fill="#EB001B"/>
                  <circle cx="12" cy="10" r="6" fill="#EB001B"/>
                  <circle cx="20" cy="10" r="6" fill="#F79E1B"/>
                </svg>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <svg className="w-8 h-5" viewBox="0 0 32 20" fill="currentColor">
                  <rect width="32" height="20" rx="2" fill="#0070BA"/>
                  <text x="16" y="13" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">PayPal</text>
                </svg>
              </div>
              <div className="flex items-center gap-2 text-xs text-text-tertiary">
                <svg className="w-8 h-5" viewBox="0 0 32 20" fill="currentColor">
                  <rect width="32" height="20" rx="2" fill="#000"/>
                  <text x="16" y="13" textAnchor="middle" fill="white" fontSize="10"></text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
