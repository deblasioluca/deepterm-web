'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import {
  Shield,
  Globe,
  CheckCircle,
  AlertCircle,
  Copy,
  RefreshCw,
  Link2,
  Settings,
  HelpCircle,
} from 'lucide-react';

interface SSOConfig {
  enabled: boolean;
  provider: string;
  entityId: string;
  ssoUrl: string;
  certificate: string;
  domains: string[];
  enforceSso: boolean;
}

const mockSSOConfig: SSOConfig = {
  enabled: true,
  provider: 'Okta',
  entityId: 'https://deepterm.net/saml/metadata',
  ssoUrl: 'https://company.okta.com/app/deepterm/sso/saml',
  certificate: '-----BEGIN CERTIFICATE-----\nMIIC...(truncated)\n-----END CERTIFICATE-----',
  domains: ['deepterm.net', 'company.com'],
  enforceSso: false,
};

const acsUrl = 'https://deepterm.net/api/auth/saml/callback';
const metadataUrl = 'https://deepterm.net/api/auth/saml/metadata';

export default function SSOPage() {
  const [config, setConfig] = useState(mockSSOConfig);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isAddDomainOpen, setIsAddDomainOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    if (newDomain && !config.domains.includes(newDomain)) {
      setConfig({ ...config, domains: [...config.domains, newDomain] });
    }
    setNewDomain('');
    setIsAddDomainOpen(false);
  };

  const removeDomain = (domain: string) => {
    setConfig({
      ...config,
      domains: config.domains.filter((d) => d !== domain),
    });
  };

  return (
    <div className="max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">SAML SSO</h1>
            <p className="text-text-secondary">
              Configure Single Sign-On for your team
            </p>
          </div>
          <Badge
            variant={config.enabled ? 'success' : 'secondary'}
            className="text-sm px-3 py-1"
          >
            {config.enabled ? 'Configured' : 'Not Configured'}
          </Badge>
        </div>

        {/* Service Provider Info */}
        <Card className="mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Settings className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                Service Provider Details
              </h2>
              <p className="text-sm text-text-secondary">
                Use these values when configuring your Identity Provider
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">
                  ACS (Assertion Consumer Service) URL
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(acsUrl, 'acs')}
                >
                  {copiedField === 'acs' ? (
                    <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <code className="text-sm text-text-primary font-mono">{acsUrl}</code>
            </div>

            <div className="p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">
                  Metadata URL
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(metadataUrl, 'metadata')}
                >
                  {copiedField === 'metadata' ? (
                    <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <code className="text-sm text-text-primary font-mono">{metadataUrl}</code>
            </div>

            <div className="p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-secondary">
                  Entity ID / Audience
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(config.entityId, 'entity')}
                >
                  {copiedField === 'entity' ? (
                    <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <code className="text-sm text-text-primary font-mono">
                {config.entityId}
              </code>
            </div>
          </div>
        </Card>

        {/* Identity Provider Config */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-primary/20 rounded-lg">
                <Shield className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Identity Provider Configuration
                </h2>
                <p className="text-sm text-text-secondary">
                  {config.enabled
                    ? `Connected to ${config.provider}`
                    : 'Configure your SAML Identity Provider'}
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setIsConfigModalOpen(true)}>
              {config.enabled ? 'Edit Configuration' : 'Configure SSO'}
            </Button>
          </div>

          {config.enabled && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-background-tertiary rounded-lg">
                  <label className="text-sm font-medium text-text-secondary block mb-1">
                    Provider
                  </label>
                  <p className="text-text-primary">{config.provider}</p>
                </div>
                <div className="p-4 bg-background-tertiary rounded-lg">
                  <label className="text-sm font-medium text-text-secondary block mb-1">
                    SSO URL
                  </label>
                  <p className="text-text-primary text-sm font-mono truncate">
                    {config.ssoUrl}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-background-tertiary rounded-lg">
                <label className="text-sm font-medium text-text-secondary block mb-2">
                  Certificate Status
                </label>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  <span className="text-text-primary">Valid certificate uploaded</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Verified Domains */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-accent-primary/20 rounded-lg">
                <Globe className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Verified Domains
                </h2>
                <p className="text-sm text-text-secondary">
                  Users with these email domains will be auto-provisioned
                </p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setIsAddDomainOpen(true)}>
              Add Domain
            </Button>
          </div>

          <div className="space-y-3">
            {config.domains.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-accent-secondary" />
                  <span className="text-text-primary font-medium">{domain}</span>
                  <Badge variant="success" className="text-xs">
                    Verified
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-accent-danger"
                  onClick={() => removeDomain(domain)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* SSO Settings */}
        <Card>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-accent-primary/20 rounded-lg">
              <Link2 className="w-5 h-5 text-accent-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-primary">SSO Settings</h2>
              <p className="text-sm text-text-secondary">
                Configure how SSO works for your team
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-background-tertiary rounded-lg">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-text-primary">Enforce SSO</p>
                  <p className="text-sm text-text-secondary">
                    Require all team members to sign in via SSO
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.enforceSso}
                  onChange={(e) =>
                    setConfig({ ...config, enforceSso: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-background-secondary rounded-full peer peer-checked:bg-accent-primary after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
              </label>
            </div>

            {config.enforceSso && (
              <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-500">SSO Enforcement Enabled</p>
                  <p className="text-sm text-text-secondary">
                    Team members will no longer be able to sign in with email/password.
                    Make sure all members have access to your SSO provider.
                  </p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </motion.div>

      {/* Configure SSO Modal */}
      <Modal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title="Configure Identity Provider"
        description="Enter your SAML Identity Provider details"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setIsConfigModalOpen(false);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              Provider
            </label>
            <select
              value={config.provider}
              onChange={(e) => setConfig({ ...config, provider: e.target.value })}
              className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
            >
              <option value="Okta">Okta</option>
              <option value="Azure AD">Azure AD</option>
              <option value="Google Workspace">Google Workspace</option>
              <option value="OneLogin">OneLogin</option>
              <option value="Other">Other SAML 2.0</option>
            </select>
          </div>
          <Input
            label="SSO URL"
            placeholder="https://your-company.okta.com/app/..."
            value={config.ssoUrl}
            onChange={(e) => setConfig({ ...config, ssoUrl: e.target.value })}
            required
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2">
              X.509 Certificate
            </label>
            <textarea
              className="w-full bg-background-tertiary border border-border rounded-button px-4 py-2.5 text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary min-h-[100px] font-mono text-sm"
              placeholder="-----BEGIN CERTIFICATE-----"
              value={config.certificate}
              onChange={(e) => setConfig({ ...config, certificate: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsConfigModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Save Configuration
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Domain Modal */}
      <Modal
        isOpen={isAddDomainOpen}
        onClose={() => setIsAddDomainOpen(false)}
        title="Add Domain"
        description="Add a domain to enable auto-provisioning for users"
      >
        <form onSubmit={handleAddDomain} className="space-y-4">
          <Input
            label="Domain"
            placeholder="company.com"
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            required
          />
          <p className="text-sm text-text-secondary">
            You&apos;ll need to verify domain ownership by adding a DNS TXT record.
          </p>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setIsAddDomainOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" className="flex-1">
              Add Domain
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
