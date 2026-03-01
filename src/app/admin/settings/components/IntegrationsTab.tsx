'use client';

import { useState, useEffect } from 'react';
import { Card, Button } from '@/components/ui';
import { GitBranch, Radio, Cpu, Loader2, CheckCircle, XCircle, RefreshCw, Workflow, Save, Eye, EyeOff, Server, Globe } from 'lucide-react';

type IntegrationStatus = {
  pi: { configured: boolean; address: string; detail: string };
  webApp: { configured: boolean; address: string; detail: string };
  ciMac: { configured: boolean; detail: string };
  github: { configured: boolean; repo: string | null; lastSync: string | null };
  nodeRed: { configured: boolean; url: string | null; reachable: boolean | null };
  aiDev: { configured: boolean };
  airflow: { configured: boolean; url: string | null };
};

export default function IntegrationsTab() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ key: string; ok: boolean; msg: string } | null>(null);

  // Airflow config form
  const [afUrl, setAfUrl] = useState('');
  const [afUsername, setAfUsername] = useState('');
  const [afPassword, setAfPassword] = useState('');
  const [afShowPassword, setAfShowPassword] = useState(false);
  const [afSaving, setAfSaving] = useState(false);
  const [afSaveResult, setAfSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [afHasPassword, setAfHasPassword] = useState(false);

  const fetchStatus = async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/admin/settings/integrations');
      if (res.ok) {
        setStatus(await res.json());
      }
    } catch (err) {
      console.error('Failed to fetch integration status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAirflowConfig = async () => {
    try {
      const res = await fetch('/api/admin/settings/integrations/airflow');
      if (res.ok) {
        const data = await res.json();
        setAfUrl(data.url || '');
        setAfUsername(data.username || '');
        setAfHasPassword(data.hasPassword || false);
        // Don't populate password field — show placeholder instead
      }
    } catch { /* ok */ }
  };

  useEffect(() => {
    fetchStatus();
    fetchAirflowConfig();
  }, []);

  const testIntegration = async (key: string) => {
    try {
      setTesting(key);
      setTestResult(null);
      const res = await fetch('/api/admin/settings/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integration: key }),
      });
      const data = await res.json();
      setTestResult({
        key,
        ok: res.ok && data.ok,
        msg: data.message || (res.ok ? 'Connection successful' : 'Connection failed'),
      });
      await fetchStatus();
    } catch (err) {
      setTestResult({
        key,
        ok: false,
        msg: err instanceof Error ? err.message : 'Connection test failed',
      });
    } finally {
      setTesting(null);
    }
  };

  const saveAirflowConfig = async () => {
    if (!afUrl || !afUsername || !afPassword) {
      setAfSaveResult({ ok: false, msg: 'All fields are required' });
      return;
    }
    try {
      setAfSaving(true);
      setAfSaveResult(null);
      const res = await fetch('/api/admin/settings/integrations/airflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: afUrl, username: afUsername, password: afPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setAfSaveResult({ ok: true, msg: data.message || 'Saved' });
        setAfPassword('');
        setAfHasPassword(true);
        await fetchStatus();
      } else {
        setAfSaveResult({ ok: false, msg: data.error || 'Save failed' });
      }
    } catch (err) {
      setAfSaveResult({ ok: false, msg: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setAfSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  const integrations = [
    {
      key: 'pi',
      label: 'Raspberry Pi',
      description: 'Database host, web server, file storage, and webhook receiver',
      icon: Server,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/20',
      configured: status?.pi?.configured ?? true,
      details: status?.pi?.detail || 'Core infrastructure',
    },
    {
      key: 'web-app',
      label: 'Web App (Next.js)',
      description: 'Admin panel, cockpit, API server running via PM2',
      icon: Globe,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/20',
      configured: status?.webApp?.configured ?? true,
      details: status?.webApp?.detail || 'localhost:3000',
    },
    {
      key: 'ci-mac',
      label: 'CI Mac',
      description: 'Self-hosted GitHub Actions runner for builds, signing, and tests',
      icon: Cpu,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      configured: status?.ciMac?.configured ?? false,
      details: status?.ciMac?.detail || 'Via GitHub Actions runner',
    },
    {
      key: 'github',
      label: 'GitHub',
      description: 'Issue sync, PR monitoring, and repository context for AI planning',
      icon: GitBranch,
      color: 'text-white',
      bgColor: 'bg-white/10',
      configured: status?.github.configured ?? false,
      details: status?.github.repo
        ? `Repo: ${status.github.repo}${status.github.lastSync ? ` \u2022 Last sync: ${new Date(status.github.lastSync).toLocaleString()}` : ''}`
        : 'GITHUB_TOKEN not set in environment',
    },
    {
      key: 'node-red',
      label: 'Node-RED',
      description: 'WhatsApp notifications, triage pipeline, and build status alerts',
      icon: Radio,
      color: 'text-red-400',
      bgColor: 'bg-red-500/20',
      configured: status?.nodeRed.configured ?? false,
      details: status?.nodeRed.url
        ? `URL: ${status.nodeRed.url}${status.nodeRed.reachable === true ? ' \u2022 Reachable' : status.nodeRed.reachable === false ? ' \u2022 Unreachable' : ''}`
        : 'NODE_RED_URL not set in environment',
    },
    {
      key: 'ai-dev',
      label: 'AI Dev Mac',
      description: 'Automated story implementation via Claude Code on development Mac',
      icon: Cpu,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/20',
      configured: status?.aiDev.configured ?? false,
      details: status?.aiDev.configured
        ? 'API key configured (AI_DEV_API_KEY)'
        : 'AI_DEV_API_KEY not set in environment',
    },
  ];

  return (
    <div className="space-y-6">
      {testResult && (
        <div className={`p-4 rounded-lg flex items-center gap-3 ${testResult.ok ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
          {testResult.ok ? (
            <CheckCircle className="w-5 h-5 text-green-500" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
          <span className={testResult.ok ? 'text-green-500' : 'text-red-500'}>{testResult.msg}</span>
        </div>
      )}

      <p className="text-sm text-text-secondary">
        External integrations are configured via environment variables or inline settings. This panel shows connection status and allows connectivity testing.
      </p>

      {integrations.map(int => (
        <Card key={int.key}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 ${int.bgColor} rounded-lg`}>
                <int.icon className={`w-6 h-6 ${int.color}`} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-text-primary">{int.label}</h3>
                  {int.configured ? (
                    <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded-full">Connected</span>
                  ) : (
                    <span className="px-2 py-0.5 text-xs bg-text-tertiary/20 text-text-tertiary rounded-full">Not configured</span>
                  )}
                </div>
                <p className="text-sm text-text-secondary mt-1">{int.description}</p>
                <p className="text-xs text-text-tertiary mt-1">{int.details}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              onClick={() => testIntegration(int.key)}
              disabled={!int.configured || testing === int.key}
            >
              {testing === int.key ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Test
            </Button>
          </div>
        </Card>
      ))}

      {/* Airflow — Inline Config Card */}
      <Card>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/20 rounded-lg">
              <Workflow className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-text-primary">Apache Airflow</h3>
                {status?.airflow?.configured ? (
                  <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-500 rounded-full">Connected</span>
                ) : (
                  <span className="px-2 py-0.5 text-xs bg-text-tertiary/20 text-text-tertiary rounded-full">Not configured</span>
                )}
              </div>
              <p className="text-sm text-text-secondary mt-1">Pipeline orchestration and DAG monitoring</p>
              {status?.airflow?.url && (
                <p className="text-xs text-text-tertiary mt-1">URL: {status.airflow.url}</p>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => testIntegration('airflow')}
            disabled={!status?.airflow?.configured || testing === 'airflow'}
          >
            {testing === 'airflow' ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Test
          </Button>
        </div>

        {/* Inline config form */}
        <div className="mt-4 pt-4 border-t border-border space-y-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Airflow URL</label>
            <input
              type="url"
              value={afUrl}
              onChange={e => setAfUrl(e.target.value)}
              placeholder={process.env.NEXT_PUBLIC_AIRFLOW_URL || "http://localhost:8080"}
              className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Username</label>
              <input
                type="text"
                value={afUsername}
                onChange={e => setAfUsername(e.target.value)}
                placeholder="admin"
                className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Password</label>
              <div className="relative">
                <input
                  type={afShowPassword ? 'text' : 'password'}
                  value={afPassword}
                  onChange={e => setAfPassword(e.target.value)}
                  placeholder={afHasPassword ? '(encrypted — enter new to update)' : 'password'}
                  className="w-full px-3 py-2 pr-10 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary"
                />
                <button
                  type="button"
                  onClick={() => setAfShowPassword(!afShowPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                >
                  {afShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              onClick={saveAirflowConfig}
              disabled={afSaving || !afUrl || !afUsername || !afPassword}
            >
              {afSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Save Credentials
            </Button>
            {afSaveResult && (
              <span className={`text-xs ${afSaveResult.ok ? 'text-green-500' : 'text-red-500'}`}>
                {afSaveResult.msg}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
