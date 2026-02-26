# DeepTerm — Settings Page Reorganization

## Implementation Target: Web App (Raspberry Pi)

All changes are frontend refactoring of `src/app/admin/settings/page.tsx` (currently 1,215 lines) into 8 tab components. No API route changes — tabs reorganize the UI only.

---

## Overview

The current settings page is a single scrolling page with 9 sections. Refactor into a tabbed layout where related functionality is grouped logically. Each tab becomes its own component file for maintainability and testability.

---

## Current State

File: `src/app/admin/settings/page.tsx` — 1,215 lines, single component.

Current sections (by `<h2>` headings):
1. **General** (line ~535) — site name, URL, support email, maintenance mode
2. **Help Page** (line ~565) — help page content editor
3. **Registration & Security** (line ~588) — allow registration, email verification, admin 2FA, passkeys
4. **Subscription Defaults** (line ~924) — max team size, trial days, default plan, Stripe webhook
5. **Release Notifications** (line ~965) — email toggle for new version notifications
6. **Danger Zone** (line ~1005) — reset stats, purge, factory reset
7. **App Releases** (line ~1041) — DMG upload, release list

State variables (~30+) are all declared at the top of the single component. API calls are inline.

---

## Target Architecture

### Tab Structure

```
┌──────────────────────────────────────────────────────────────┐
│ ⚙️ Settings                                                  │
│                                                               │
│ [🏠 General] [🔐 Security] [💳 Billing] [📬 Notifications]  │
│ [📦 Releases] [🤖 AI & LLM] [🔄 Integrations] [⚠️ Danger]  │
└──────────────────────────────────────────────────────────────┘
```

### Tab → Content Mapping

| Tab | Content | Source |
|-----|---------|--------|
| 🏠 General | Site name, URL, support email, maintenance mode, help page content | Existing: General + Help Page sections |
| 🔐 Security | Allow registration, require email verification, admin 2FA setup, passkey management | Existing: Registration & Security section |
| 💳 Billing | Subscription defaults (max team, trial days, default plan), Stripe webhook secret, Stripe mode indicator | Existing: Subscription Defaults section |
| 📬 Notifications | Release email toggle, SMTP test email, WhatsApp/Node-RED test | Existing: Release Notifications + email/WhatsApp test functions |
| 📦 Releases | DMG upload form, release list | Existing: App Releases section |
| 🤖 AI & LLM | AI providers, model assignments, agent loop configs, usage budget | **NEW** — from AI Deliberation System Prompt |
| 🔄 Integrations | GitHub, Node-RED, Airflow, AI Dev Mac connection settings | **NEW** — partially from existing, partially new |
| ⚠️ Danger Zone | Reset statistics, purge deleted items, reset admin password, factory reset | Existing: Danger Zone section |

---

## File Structure

```
src/app/admin/settings/
  page.tsx                          ← Refactored: tab container only (~100 lines)
  components/
    GeneralTab.tsx                  ← Site identity + help page
    SecurityTab.tsx                 ← Registration, 2FA, passkeys
    BillingTab.tsx                  ← Stripe, subscription defaults
    NotificationsTab.tsx            ← Email, WhatsApp
    ReleasesTab.tsx                 ← App release upload + history
    AISettingsTab.tsx               ← Providers, assignments, agent configs, budget
    IntegrationsTab.tsx             ← GitHub, Node-RED, Airflow, AI Dev Mac
    DangerZoneTab.tsx               ← Destructive actions
```

---

## Main Container: `page.tsx`

Replace the entire 1,215-line file with this tab container:

```typescript
// src/app/admin/settings/page.tsx
'use client';

import { useState } from 'react';
import GeneralTab from './components/GeneralTab';
import SecurityTab from './components/SecurityTab';
import BillingTab from './components/BillingTab';
import NotificationsTab from './components/NotificationsTab';
import ReleasesTab from './components/ReleasesTab';
import AISettingsTab from './components/AISettingsTab';
import IntegrationsTab from './components/IntegrationsTab';
import DangerZoneTab from './components/DangerZoneTab';

const TABS = [
  { key: 'general',        label: '🏠 General',        component: GeneralTab },
  { key: 'security',       label: '🔐 Security',       component: SecurityTab },
  { key: 'billing',        label: '💳 Billing',         component: BillingTab },
  { key: 'notifications',  label: '📬 Notifications',   component: NotificationsTab },
  { key: 'releases',       label: '📦 Releases',        component: ReleasesTab },
  { key: 'ai',             label: '🤖 AI & LLM',       component: AISettingsTab },
  { key: 'integrations',   label: '🔄 Integrations',    component: IntegrationsTab },
  { key: 'danger',         label: '⚠️ Danger Zone',     component: DangerZoneTab },
];

export default function AdminSettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const ActiveComponent = TABS.find(t => t.key === activeTab)?.component || GeneralTab;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold text-text-primary mb-2">Settings</h1>
      <p className="text-text-secondary mb-6">Manage your DeepTerm instance configuration.</p>

      {/* Tab Bar */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-border-primary pb-4">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-accent-primary text-white'
                : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      <ActiveComponent />
    </div>
  );
}
```

---

## Tab Components — Migration Guide

Each section below specifies exactly what moves from the current `page.tsx` into each tab component. All tab components are self-contained with their own state, effects, and API calls.

### 🏠 GeneralTab.tsx

**Moves from current page.tsx:**
- State: `settings` object (siteName, siteUrl, supportEmail), `isLoading`, `isSaving`
- Effect: fetch `/api/admin/settings` on mount
- UI: General section (site name, URL, support email inputs + save button)
- UI: Help Page section (content editor + save button)

**Template:**

```typescript
// src/app/admin/settings/components/GeneralTab.tsx
'use client';

import { useState, useEffect } from 'react';

interface GeneralSettings {
  siteName: string;
  siteUrl: string;
  supportEmail: string;
  maintenanceMode: boolean;
}

export default function GeneralTab() {
  const [settings, setSettings] = useState<GeneralSettings>({
    siteName: 'DeepTerm',
    siteUrl: 'https://deepterm.net',
    supportEmail: 'support@deepterm.net',
    maintenanceMode: false,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch settings from /api/admin/settings
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => setSettings(prev => ({ ...prev, ...data })))
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* General Settings */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">General</h2>
        {/* MOVE: site name, URL, support email, maintenance toggle from current page */}
        {/* MOVE: save button */}
      </section>

      {/* Help Page Content */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Help Page</h2>
        {/* MOVE: help page content editor from current page */}
        {/* MOVE: save button */}
      </section>
    </div>
  );
}
```

**Lines to extract from current page.tsx:** ~535–587 (General + Help Page UI), relevant state vars and handlers.

---

### 🔐 SecurityTab.tsx

**Moves from current page.tsx:**
- State: `admin2fa`, `adminPasskeys`, `isRegisteringPasskey`, `passkeyName`, `backupCodes`, registration toggles
- Effects: fetch 2FA status, fetch passkeys
- UI: Registration toggle, email verification toggle
- UI: Admin 2FA setup/status
- UI: Passkey list, register new passkey, remove passkey
- UI: Backup codes display

**Template:**

```typescript
// src/app/admin/settings/components/SecurityTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Fingerprint, Shield, Key } from 'lucide-react';

type Admin2FAStatus = {
  enabled: boolean;
  method?: string;
  backupCodesRemaining?: number;
};

type PasskeyRow = {
  id: string;
  name: string;
  createdAt: string;
};

export default function SecurityTab() {
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [requireEmailVerification, setRequireEmailVerification] = useState(true);
  const [admin2fa, setAdmin2fa] = useState<Admin2FAStatus | null>(null);
  const [adminPasskeys, setAdminPasskeys] = useState<PasskeyRow[]>([]);
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState('Admin Passkey');

  useEffect(() => {
    // Fetch registration settings
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        setAllowRegistration(data.allowRegistration ?? true);
        setRequireEmailVerification(data.requireEmailVerification ?? true);
      });
    
    // Fetch 2FA status
    fetch('/api/admin/2fa/status')
      .then(r => r.json())
      .then(setAdmin2fa);
    
    // Fetch passkeys
    fetch('/api/admin/passkeys')
      .then(r => r.json())
      .then(data => setAdminPasskeys(data.passkeys || []));
  }, []);

  return (
    <div className="space-y-8">
      {/* Registration */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Registration</h2>
        {/* MOVE: Allow registration toggle */}
        {/* MOVE: Require email verification toggle */}
      </section>

      {/* Admin Authentication */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Admin Authentication</h2>
        {/* MOVE: 2FA status, setup/disable buttons */}
        {/* MOVE: Backup codes section */}
      </section>

      {/* Passkeys */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Passkeys</h2>
        {/* MOVE: Passkey list with remove buttons */}
        {/* MOVE: Register new passkey form */}
      </section>
    </div>
  );
}
```

**Lines to extract:** ~588–923 (Registration & Security section), 2FA-related state/effects/handlers.

---

### 💳 BillingTab.tsx

**Moves from current page.tsx:**
- State: subscription defaults (maxTeamSize, trialDays, defaultPlan), Stripe webhook secret
- UI: Subscription defaults form
- UI: Stripe webhook secret field

**Template:**

```typescript
// src/app/admin/settings/components/BillingTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { CreditCard, Database } from 'lucide-react';

export default function BillingTab() {
  const [defaults, setDefaults] = useState({
    maxTeamSize: 50,
    trialDays: 14,
    defaultPlan: 'starter',
  });
  const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
  const [stripeMode, setStripeMode] = useState<'test' | 'live'>('test');

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => {
        setDefaults({
          maxTeamSize: data.maxTeamSize || 50,
          trialDays: data.trialDays || 14,
          defaultPlan: data.defaultPlan || 'starter',
        });
        setStripeWebhookSecret(data.stripeWebhookSecret || '');
        setStripeMode(data.stripeMode || 'test');
      });
  }, []);

  return (
    <div className="space-y-8">
      {/* Subscription Defaults */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Database className="w-5 h-5 inline mr-2 text-green-500" />
          Subscription Defaults
        </h2>
        {/* MOVE: Max team size, trial days, default plan inputs */}
        {/* MOVE: Save button */}
      </section>

      {/* Stripe */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <CreditCard className="w-5 h-5 inline mr-2" />
          Stripe
        </h2>
        {/* Mode indicator: 🟢 Live or 🟡 Test */}
        {/* Webhook secret field (masked) */}
        {/* Test webhook button */}
      </section>
    </div>
  );
}
```

**Lines to extract:** ~924–964 (Subscription Defaults section).

---

### 📬 NotificationsTab.tsx

**Moves from current page.tsx:**
- State: `isSendingTestEmail`, `testEmailRecipient`, `testEmailSuccess`, `isSendingTestWhatsApp`, `testWhatsAppType`, `testWhatsAppSuccess`, `testWhatsAppError`, release email toggle
- Handlers: sendTestEmail, sendTestWhatsApp
- UI: Release notification email toggle
- UI: Test email form
- UI: Test WhatsApp form

**Template:**

```typescript
// src/app/admin/settings/components/NotificationsTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Mail, MessageSquare } from 'lucide-react';

export default function NotificationsTab() {
  const [notifyOnRelease, setNotifyOnRelease] = useState(true);

  // Email test state
  const [isSendingTestEmail, setIsSendingTestEmail] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testEmailSuccess, setTestEmailSuccess] = useState<string | null>(null);
  const [testEmailError, setTestEmailError] = useState<string | null>(null);

  // WhatsApp test state
  const [isSendingTestWhatsApp, setIsSendingTestWhatsApp] = useState(false);
  const [testWhatsAppType, setTestWhatsAppType] = useState('triage');
  const [testWhatsAppSuccess, setTestWhatsAppSuccess] = useState<string | null>(null);
  const [testWhatsAppError, setTestWhatsAppError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings')
      .then(r => r.json())
      .then(data => setNotifyOnRelease(data.notifyOnRelease ?? true));
  }, []);

  const sendTestEmail = async () => {
    // MOVE: existing sendTestEmail handler
  };

  const sendTestWhatsApp = async () => {
    // MOVE: existing sendTestWhatsApp handler
  };

  return (
    <div className="space-y-8">
      {/* Email */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Mail className="w-5 h-5 inline mr-2" />
          Email
        </h2>
        {/* MOVE: Release email toggle */}
        {/* MOVE: Test email form */}
      </section>

      {/* WhatsApp */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <MessageSquare className="w-5 h-5 inline mr-2" />
          WhatsApp (via Node-RED)
        </h2>
        {/* MOVE: Node-RED connection status indicator */}
        {/* MOVE: Test WhatsApp form */}
      </section>
    </div>
  );
}
```

**Lines to extract:** ~965–1004 (Release Notifications), plus email/WhatsApp test state and handlers from top of current file.

---

### 📦 ReleasesTab.tsx

**Moves from current page.tsx:**
- State: release upload form state, release list
- Handlers: file upload, version input, notes input, submit
- UI: Upload form (platform, version, file picker, notes)
- UI: Release history table

**Template:**

```typescript
// src/app/admin/settings/components/ReleasesTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Upload, Package } from 'lucide-react';

interface Release {
  id: string;
  version: string;
  platform: string;
  createdAt: string;
  fileSize?: number;
  filename?: string;
}

export default function ReleasesTab() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    platform: 'macos',
    version: '',
    notes: '',
    file: null as File | null,
  });

  useEffect(() => {
    fetch('/api/admin/releases')
      .then(r => r.json())
      .then(data => setReleases(data.releases || []));
  }, []);

  const handleUpload = async () => {
    // MOVE: existing upload handler
  };

  return (
    <div className="space-y-8">
      {/* Upload */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Upload className="w-5 h-5 inline mr-2" />
          Upload New Release
        </h2>
        {/* MOVE: Platform selector, version input, file picker, notes, upload button */}
      </section>

      {/* History */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Package className="w-5 h-5 inline mr-2" />
          Release History
        </h2>
        {/* MOVE: Release list table */}
      </section>
    </div>
  );
}
```

**Lines to extract:** ~1041–1215 (App Releases section).

---

### 🤖 AISettingsTab.tsx

**NEW tab — not in current page.tsx.** Content defined in AI Deliberation System Prompt.

```typescript
// src/app/admin/settings/components/AISettingsTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Bot, Cpu, Zap, DollarSign } from 'lucide-react';

interface AIProvider {
  id: string;
  name: string;       // "Anthropic", "OpenAI", etc.
  slug: string;       // "anthropic", "openai"
  apiKeyMasked: string;
  isEnabled: boolean;
  isValid: boolean;
  models: AIModel[];
}

interface AIModel {
  id: string;
  modelId: string;    // "claude-opus-4-6"
  displayName: string;
  costPer1kInput: number;
  costPer1kOutput: number;
}

interface AIActivityAssignment {
  activity: string;
  displayName: string;
  category: string;
  assignedModelId: string;
  assignedProviderSlug: string;
}

interface AgentLoopConfig {
  id: string;
  name: string;       // "default", "careful", "fast", etc.
  maxIterations: number;
  maxDurationMinutes: number;
  autoPR: boolean;
}

export default function AISettingsTab() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [assignments, setAssignments] = useState<AIActivityAssignment[]>([]);
  const [configs, setConfigs] = useState<AgentLoopConfig[]>([]);
  const [budget, setBudget] = useState({ monthlyLimit: 50, alertAt: 80, hardLimit: false });

  useEffect(() => {
    // Fetch providers
    fetch('/api/admin/settings/ai/providers')
      .then(r => r.json())
      .then(data => setProviders(data.providers || []));
    
    // Fetch assignments
    fetch('/api/admin/settings/ai/assignments')
      .then(r => r.json())
      .then(data => setAssignments(data.assignments || []));
    
    // Fetch agent loop configs
    fetch('/api/admin/settings/ai/agent-configs')
      .then(r => r.json())
      .then(data => setConfigs(data.configs || []));
    
    // Fetch budget
    fetch('/api/admin/settings/ai/budget')
      .then(r => r.json())
      .then(setBudget);
  }, []);

  return (
    <div className="space-y-8">
      {/* Providers */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Cpu className="w-5 h-5 inline mr-2" />
          AI Providers
        </h2>
        {/* Provider cards: name, masked API key, status, models */}
        {/* [Edit] [Validate] [Disable] buttons per provider */}
        {/* Add new provider form */}
        {providers.map(provider => (
          <div key={provider.id} className="border border-border-primary rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{provider.name}</span>
                <span className={`ml-2 text-sm ${provider.isValid ? 'text-green-500' : 'text-red-500'}`}>
                  {provider.isValid ? '✅ Connected' : '❌ Not configured'}
                </span>
              </div>
              <div className="flex gap-2">
                <button className="text-sm px-3 py-1 rounded bg-bg-tertiary">Edit</button>
                <button className="text-sm px-3 py-1 rounded bg-bg-tertiary">Validate</button>
                <button className="text-sm px-3 py-1 rounded bg-bg-tertiary">
                  {provider.isEnabled ? 'Disable' : 'Enable'}
                </button>
              </div>
            </div>
            <div className="text-sm text-text-tertiary mt-1">
              API Key: {provider.apiKeyMasked || 'Not set'}
            </div>
            <div className="text-sm text-text-tertiary mt-1">
              Models: {provider.models.map(m => m.displayName).join(', ') || 'None'}
            </div>
          </div>
        ))}
      </section>

      {/* Model Assignments */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Zap className="w-5 h-5 inline mr-2" />
          Model Assignments
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          Choose which model handles each AI activity.
        </p>
        {/* Table: Activity Name | Category | Assigned Model dropdown */}
        <div className="space-y-3">
          {assignments.map(a => (
            <div key={a.activity} className="flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">{a.displayName}</span>
                <span className="text-xs text-text-tertiary ml-2">({a.category})</span>
              </div>
              <select
                className="bg-bg-tertiary border border-border-primary rounded px-3 py-1 text-sm"
                value={`${a.assignedProviderSlug}:${a.assignedModelId}`}
                onChange={(e) => {
                  // Update assignment via API
                }}
              >
                {/* Options from all enabled providers' models */}
              </select>
            </div>
          ))}
        </div>
      </section>

      {/* Agent Loop Configurations */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Bot className="w-5 h-5 inline mr-2" />
          Agent Loop Configurations
        </h2>
        {/* Config cards: name, maxIterations, maxDuration, autoPR, edit button */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map(config => (
            <div key={config.id} className="border border-border-primary rounded-lg p-4">
              <div className="font-medium">{config.name}</div>
              <div className="text-sm text-text-tertiary mt-1">
                Max iterations: {config.maxIterations} | 
                Max duration: {config.maxDurationMinutes}m | 
                Auto-PR: {config.autoPR ? '✅' : '❌'}
              </div>
              <button className="mt-2 text-sm text-accent-primary">Edit</button>
            </div>
          ))}
        </div>
      </section>

      {/* Usage Budget */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <DollarSign className="w-5 h-5 inline mr-2" />
          Usage Budget
        </h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-text-secondary">Monthly Budget (USD)</label>
            <input
              type="number"
              value={budget.monthlyLimit}
              onChange={(e) => setBudget({ ...budget, monthlyLimit: Number(e.target.value) })}
              className="ml-2 bg-bg-tertiary border border-border-primary rounded px-3 py-1 w-24"
            />
          </div>
          <div>
            <label className="text-sm text-text-secondary">Alert at (%)</label>
            <input
              type="number"
              value={budget.alertAt}
              onChange={(e) => setBudget({ ...budget, alertAt: Number(e.target.value) })}
              className="ml-2 bg-bg-tertiary border border-border-primary rounded px-3 py-1 w-20"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={budget.hardLimit}
              onChange={(e) => setBudget({ ...budget, hardLimit: e.target.checked })}
            />
            <label className="text-sm text-text-secondary">
              Hard limit — pause all AI when budget exceeded
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
```

**New API routes needed** (defined in AI Deliberation System Prompt):
- `GET/PUT /api/admin/settings/ai/providers`
- `GET/PUT /api/admin/settings/ai/assignments`
- `GET/PUT /api/admin/settings/ai/agent-configs`
- `GET/PUT /api/admin/settings/ai/budget`

---

### 🔄 IntegrationsTab.tsx

**NEW tab — consolidates external service connections.**

```typescript
// src/app/admin/settings/components/IntegrationsTab.tsx
'use client';

import { useState, useEffect } from 'react';
import { Github, Radio, Wind, Monitor } from 'lucide-react';

interface IntegrationStatus {
  connected: boolean;
  lastChecked?: string;
  details?: string;
}

interface IntegrationConfig {
  github: {
    token: string;       // masked
    webhookSecret: string; // masked
    appRepo: string;
    webRepo: string;
    status: IntegrationStatus;
  };
  nodeRed: {
    url: string;
    apiKey: string;      // masked
    status: IntegrationStatus;
  };
  airflow: {
    url: string;
    username: string;
    password: string;    // masked
    status: IntegrationStatus;
  };
  aiDevMac: {
    sshHost: string;
    status: IntegrationStatus;
    lastHeartbeat?: string;
  };
}

export default function IntegrationsTab() {
  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/admin/settings/integrations')
      .then(r => r.json())
      .then(setConfig);
  }, []);

  const testConnection = async (service: string) => {
    setTesting(service);
    try {
      const resp = await fetch(`/api/admin/settings/integrations/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const result = await resp.json();
      // Update status
      setConfig(prev => prev ? {
        ...prev,
        [service]: { ...prev[service as keyof IntegrationConfig], status: result },
      } : prev);
    } finally {
      setTesting(null);
    }
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      {/* GitHub */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Github className="w-5 h-5 inline mr-2" />
          GitHub
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Token</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-text-tertiary">{config.github.token}</span>
              <button className="text-sm text-accent-primary">Edit</button>
              <button className="text-sm text-accent-primary">Validate</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Webhook Secret</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-text-tertiary">{config.github.webhookSecret}</span>
              <button className="text-sm text-accent-primary">Edit</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">App Repo</span>
            <span className="text-sm">{config.github.appRepo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Web Repo</span>
            <span className="text-sm">{config.github.webRepo}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <span className={`text-sm ${config.github.status.connected ? 'text-green-500' : 'text-red-500'}`}>
              {config.github.status.connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
        </div>
      </section>

      {/* Node-RED */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Radio className="w-5 h-5 inline mr-2" />
          Node-RED
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">URL</span>
            <span className="text-sm font-mono">{config.nodeRed.url}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">API Key</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-text-tertiary">{config.nodeRed.apiKey}</span>
              <button className="text-sm text-accent-primary">Edit</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <span className={`text-sm ${config.nodeRed.status.connected ? 'text-green-500' : 'text-red-500'}`}>
              {config.nodeRed.status.connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </div>
          <button
            onClick={() => testConnection('nodeRed')}
            disabled={testing === 'nodeRed'}
            className="px-4 py-2 bg-accent-primary text-white rounded text-sm"
          >
            {testing === 'nodeRed' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </section>

      {/* Airflow */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Wind className="w-5 h-5 inline mr-2" />
          Airflow
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">URL</span>
            <span className="text-sm font-mono">{config.airflow.url}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Username</span>
            <span className="text-sm">{config.airflow.username}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Password</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-text-tertiary">{config.airflow.password}</span>
              <button className="text-sm text-accent-primary">Edit</button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <span className={`text-sm ${config.airflow.status.connected ? 'text-green-500' : 'text-red-500'}`}>
              {config.airflow.status.connected
                ? `🟢 Connected (${config.airflow.status.details})`
                : '🔴 Disconnected'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => testConnection('airflow')}
              disabled={testing === 'airflow'}
              className="px-4 py-2 bg-accent-primary text-white rounded text-sm"
            >
              {testing === 'airflow' ? 'Testing...' : 'Test Connection'}
            </button>
            <a
              href={config.airflow.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-border-primary rounded text-sm text-text-secondary hover:text-text-primary"
            >
              Open Airflow UI ↗
            </a>
          </div>
        </div>
      </section>

      {/* AI Dev Mac */}
      <section className="bg-bg-secondary rounded-xl p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">
          <Monitor className="w-5 h-5 inline mr-2" />
          AI Dev Mac
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">SSH Host</span>
            <span className="text-sm font-mono">{config.aiDevMac.sshHost}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Status</span>
            <span className={`text-sm ${config.aiDevMac.status.connected ? 'text-green-500' : 'text-red-500'}`}>
              {config.aiDevMac.status.connected ? '🟢 Reachable' : '🔴 Unreachable'}
            </span>
          </div>
          {config.aiDevMac.lastHeartbeat && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">Last Heartbeat</span>
              <span className="text-sm">{config.aiDevMac.lastHeartbeat}</span>
            </div>
          )}
          <button
            onClick={() => testConnection('aiDevMac')}
            disabled={testing === 'aiDevMac'}
            className="px-4 py-2 bg-accent-primary text-white rounded text-sm"
          >
            {testing === 'aiDevMac' ? 'Testing...' : 'Test Connection'}
          </button>
        </div>
      </section>
    </div>
  );
}
```

**New API routes needed:**
- `GET /api/admin/settings/integrations` — reads all integration configs from SystemSettings
- `PUT /api/admin/settings/integrations/[service]` — updates config for one service
- `POST /api/admin/settings/integrations/test` — tests a connection (SSH, HTTP, API)

---

### ⚠️ DangerZoneTab.tsx

**Moves from current page.tsx:**
- Handlers: reset stats, purge deleted, reset admin password, factory reset
- UI: Danger zone buttons with confirmation dialogs

```typescript
// src/app/admin/settings/components/DangerZoneTab.tsx
'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function DangerZoneTab() {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const dangerActions = [
    {
      key: 'reset-stats',
      label: 'Reset All Statistics',
      description: 'Clears all AI usage logs, aggregates, and analytics data.',
      endpoint: '/api/admin/settings/danger/reset-stats',
    },
    {
      key: 'purge-deleted',
      label: 'Purge Deleted Items',
      description: 'Permanently removes all soft-deleted vault items, users, and data.',
      endpoint: '/api/admin/settings/danger/purge-deleted',
    },
    {
      key: 'reset-password',
      label: 'Reset Admin Password',
      description: 'Generates a new random admin password. You will be logged out.',
      endpoint: '/api/admin/settings/danger/reset-password',
    },
    {
      key: 'factory-reset',
      label: 'Factory Reset',
      description: 'Resets ALL settings to defaults. Does not delete user data.',
      endpoint: '/api/admin/settings/danger/factory-reset',
    },
  ];

  const executeAction = async (action: typeof dangerActions[0]) => {
    setIsRunning(true);
    try {
      await fetch(action.endpoint, { method: 'POST' });
      setConfirming(null);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-500 mb-2">
          <AlertTriangle className="w-5 h-5 inline mr-2" />
          Danger Zone
        </h2>
        <p className="text-sm text-text-secondary mb-6">
          These actions cannot be undone. Proceed with caution.
        </p>

        <div className="space-y-4">
          {dangerActions.map(action => (
            <div key={action.key} className="flex items-center justify-between border-t border-red-500/20 pt-4">
              <div>
                <div className="font-medium text-text-primary">{action.label}</div>
                <div className="text-sm text-text-tertiary">{action.description}</div>
              </div>
              {confirming === action.key ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => executeAction(action)}
                    disabled={isRunning}
                    className="px-4 py-2 bg-red-600 text-white rounded text-sm"
                  >
                    {isRunning ? 'Running...' : 'Confirm'}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="px-4 py-2 border border-border-primary rounded text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirming(action.key)}
                  className="px-4 py-2 border border-red-500 text-red-500 rounded text-sm hover:bg-red-500/10"
                >
                  {action.label}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Lines to extract:** ~1005–1040 (Danger Zone section).

---

## Migration Steps

1. **Create component files** — create all 8 files in `src/app/admin/settings/components/`
2. **Move existing code** — for each tab, extract the relevant state, effects, handlers, and JSX from the current 1,215-line `page.tsx` into the corresponding component
3. **Replace page.tsx** — replace the entire file with the tab container (~100 lines)
4. **Test each tab** — verify each tab loads correctly, state initializes, API calls work
5. **Add new tabs** — implement AI & LLM and Integrations tabs with new API routes
6. **Verify no regressions** — all existing functionality works exactly as before

### Order of Implementation

| Step | What | Risk |
|------|------|------|
| 1 | Create `page.tsx` tab container | Low — just UI shell |
| 2 | Move GeneralTab | Low — simple fields |
| 3 | Move DangerZoneTab | Low — isolated actions |
| 4 | Move ReleasesTab | Low — self-contained |
| 5 | Move NotificationsTab | Medium — email/WhatsApp test state |
| 6 | Move BillingTab | Low — simple fields |
| 7 | Move SecurityTab | High — 2FA/passkey logic is complex |
| 8 | Create IntegrationsTab (new) | Medium — new API routes |
| 9 | Create AISettingsTab (new) | High — depends on AI provider system |

---

## Files to Create

| File | Lines (est.) | Type |
|------|-------------|------|
| `src/app/admin/settings/components/GeneralTab.tsx` | ~120 | Moved |
| `src/app/admin/settings/components/SecurityTab.tsx` | ~280 | Moved |
| `src/app/admin/settings/components/BillingTab.tsx` | ~100 | Moved |
| `src/app/admin/settings/components/NotificationsTab.tsx` | ~180 | Moved |
| `src/app/admin/settings/components/ReleasesTab.tsx` | ~160 | Moved |
| `src/app/admin/settings/components/AISettingsTab.tsx` | ~250 | New |
| `src/app/admin/settings/components/IntegrationsTab.tsx` | ~300 | New |
| `src/app/admin/settings/components/DangerZoneTab.tsx` | ~100 | Moved |

## Files to Modify

| File | Change |
|------|--------|
| `src/app/admin/settings/page.tsx` | Replace 1,215 lines → ~100 line tab container |

## New API Routes (for new tabs only)

| Route | Purpose |
|-------|---------|
| `GET/PUT /api/admin/settings/ai/providers` | AI provider CRUD |
| `GET/PUT /api/admin/settings/ai/assignments` | Model assignment CRUD |
| `GET/PUT /api/admin/settings/ai/agent-configs` | Agent loop config CRUD |
| `GET/PUT /api/admin/settings/ai/budget` | Budget settings |
| `GET /api/admin/settings/integrations` | All integration configs |
| `PUT /api/admin/settings/integrations/[service]` | Update one service |
| `POST /api/admin/settings/integrations/test` | Test a connection |

---

## Testing Checklist

- [ ] Tab container renders with all 8 tabs
- [ ] Clicking each tab shows correct content
- [ ] 🏠 General: site name/URL/email load and save correctly
- [ ] 🏠 General: help page content loads and saves
- [ ] 🔐 Security: registration toggles work
- [ ] 🔐 Security: 2FA status displays correctly
- [ ] 🔐 Security: passkey registration works
- [ ] 🔐 Security: passkey removal works
- [ ] 💳 Billing: subscription defaults load and save
- [ ] 💳 Billing: Stripe webhook secret editable
- [ ] 📬 Notifications: release email toggle works
- [ ] 📬 Notifications: test email sends successfully
- [ ] 📬 Notifications: test WhatsApp sends successfully
- [ ] 📦 Releases: DMG upload works
- [ ] 📦 Releases: release history displays
- [ ] 🤖 AI: providers list with status
- [ ] 🤖 AI: model assignments changeable
- [ ] 🤖 AI: agent configs displayed
- [ ] 🤖 AI: budget settings save
- [ ] 🔄 Integrations: all 4 services show status
- [ ] 🔄 Integrations: test connection works for each
- [ ] 🔄 Integrations: "Open Airflow UI" link works
- [ ] ⚠️ Danger: confirmation flow works
- [ ] ⚠️ Danger: actions execute correctly
- [ ] No console errors on any tab
- [ ] Mobile responsive — tabs wrap on small screens

---

*End of Document — Settings Page Reorganization — Web App — 2026-02-26*
