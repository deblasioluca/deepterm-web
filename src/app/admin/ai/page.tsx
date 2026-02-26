'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Brain,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Save,
  RotateCcw,
  Shield,
  Zap,
  Globe,
  X,
} from 'lucide-react';

// ── Types ────────────────────────────────────────

interface ProviderModel {
  id: string;
  modelId: string;
  displayName: string;
  capabilities: string;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  isEnabled: boolean;
}

interface Provider {
  id: string;
  name: string;
  slug: string;
  keyMasked: string;
  hasKey: boolean;
  baseUrl: string | null;
  isEnabled: boolean;
  isValid: boolean;
  lastValidated: string | null;
  models: ProviderModel[];
}

interface ActivityAssignment {
  key: string;
  label: string;
  description: string;
  category: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  assignment: {
    id: string;
    modelId: string;
    modelDisplayName: string;
    modelModelId: string;
    providerName: string;
    providerSlug: string;
    temperature: number;
    maxTokens: number;
    systemPromptOverride: string | null;
  } | null;
}

// ── Provider presets ─────────────────────────────

const PROVIDER_PRESETS: Record<string, { name: string; models: { modelId: string; displayName: string; contextWindow: number }[] }> = {
  anthropic: {
    name: 'Anthropic',
    models: [
      { modelId: 'claude-opus-4-6', displayName: 'Claude Opus 4.6', contextWindow: 200000 },
      { modelId: 'claude-sonnet-4-6', displayName: 'Claude Sonnet 4.6', contextWindow: 200000 },
      { modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', contextWindow: 200000 },
    ],
  },
  openai: {
    name: 'OpenAI',
    models: [
      { modelId: 'gpt-4o', displayName: 'GPT-4o', contextWindow: 128000 },
      { modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', contextWindow: 128000 },
      { modelId: 'o1', displayName: 'o1', contextWindow: 200000 },
      { modelId: 'o3-mini', displayName: 'o3-mini', contextWindow: 200000 },
    ],
  },
  google: {
    name: 'Google',
    models: [
      { modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', contextWindow: 1000000 },
      { modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', contextWindow: 1000000 },
    ],
  },
  mistral: {
    name: 'Mistral',
    models: [
      { modelId: 'mistral-large-latest', displayName: 'Mistral Large', contextWindow: 128000 },
      { modelId: 'mistral-medium-latest', displayName: 'Mistral Medium', contextWindow: 32000 },
    ],
  },
  groq: {
    name: 'Groq',
    models: [
      { modelId: 'llama-3.3-70b-versatile', displayName: 'Llama 3.3 70B', contextWindow: 128000 },
      { modelId: 'mixtral-8x7b-32768', displayName: 'Mixtral 8x7B', contextWindow: 32768 },
    ],
  },
};

const CATEGORY_COLORS: Record<string, string> = {
  deliberation: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  planning: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  reports: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  issues: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  ci: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
};

// ── Main Component ───────────────────────────────

export default function AIConfigPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [assignments, setAssignments] = useState<ActivityAssignment[]>([]);
  const [allModels, setAllModels] = useState<(ProviderModel & { provider: { name: string; slug: string; isEnabled: boolean } })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'providers' | 'models' | 'assignments'>('providers');

  const fetchData = useCallback(async () => {
    try {
      const [provRes, assignRes, modelsRes] = await Promise.all([
        fetch('/api/admin/cockpit/ai-providers'),
        fetch('/api/admin/cockpit/ai-assignments'),
        fetch('/api/admin/cockpit/ai-models'),
      ]);
      if (provRes.ok) setProviders(await provRes.json());
      if (assignRes.ok) setAssignments(await assignRes.json());
      if (modelsRes.ok) setAllModels(await modelsRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <Brain className="w-7 h-7 text-purple-400" />
          AI Configuration
        </h1>
        <p className="text-sm text-zinc-400 mt-1">Manage AI providers, models, and activity assignments</p>
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
        {[
          { key: 'providers' as const, label: 'Providers', count: providers.length },
          { key: 'models' as const, label: 'Models', count: allModels.length },
          { key: 'assignments' as const, label: 'Activity Assignments', count: assignments.length },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveSection(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium transition ${
              activeSection === tab.key
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-500 hover:text-zinc-300 border border-transparent'
            }`}
          >
            {tab.label}
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-zinc-700 text-zinc-300">{tab.count}</span>
          </button>
        ))}
      </div>

      {activeSection === 'providers' && (
        <ProvidersSection providers={providers} onRefresh={fetchData} />
      )}
      {activeSection === 'models' && (
        <ModelsSection providers={providers} allModels={allModels} onRefresh={fetchData} />
      )}
      {activeSection === 'assignments' && (
        <AssignmentsSection assignments={assignments} allModels={allModels} onRefresh={fetchData} />
      )}
    </div>
  );
}

// ── Providers Section ────────────────────────────

function ProvidersSection({ providers, onRefresh }: { providers: Provider[]; onRefresh: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [addSlug, setAddSlug] = useState('');
  const [addKey, setAddKey] = useState('');
  const [addBaseUrl, setAddBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const existingSlugs = new Set(providers.map(p => p.slug));
  const availableSlugs = Object.keys(PROVIDER_PRESETS).filter(s => !existingSlugs.has(s));

  const addProvider = async () => {
    if (!addSlug || !addKey) return;
    setSaving(true);
    try {
      const preset = PROVIDER_PRESETS[addSlug];
      const res = await fetch('/api/admin/cockpit/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: preset.name, slug: addSlug, apiKey: addKey, baseUrl: addBaseUrl || null }),
      });
      if (res.ok) {
        const provider = await res.json();
        // Auto-add preset models
        for (const m of preset.models) {
          await fetch('/api/admin/cockpit/ai-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId: provider.id, ...m }),
          });
        }
        setShowAdd(false);
        setAddSlug('');
        setAddKey('');
        setAddBaseUrl('');
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const validateProvider = async (id: string) => {
    setValidating(id);
    try {
      await fetch(`/api/admin/cockpit/ai-providers/${id}/validate`, { method: 'POST' });
      onRefresh();
    } finally {
      setValidating(null);
    }
  };

  const toggleProvider = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      await fetch(`/api/admin/cockpit/ai-providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: enabled }),
      });
      onRefresh();
    } finally {
      setToggling(null);
    }
  };

  const deleteProvider = async (id: string) => {
    await fetch(`/api/admin/cockpit/ai-providers/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">AI Providers</h2>
        {availableSlugs.length > 0 && (
          <button
            onClick={() => { setShowAdd(true); setAddSlug(availableSlugs[0]); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Provider
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-3">
            <select
              value={addSlug}
              onChange={e => setAddSlug(e.target.value)}
              className="bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
            >
              {availableSlugs.map(s => (
                <option key={s} value={s}>{PROVIDER_PRESETS[s].name}</option>
              ))}
            </select>
            <input
              type="password"
              value={addKey}
              onChange={e => setAddKey(e.target.value)}
              placeholder="API Key"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <input
            type="text"
            value={addBaseUrl}
            onChange={e => setAddBaseUrl(e.target.value)}
            placeholder="Base URL (optional, for proxies)"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={addProvider}
              disabled={!addSlug || !addKey || saving}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-xs font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              Add + Auto-populate Models
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="flex items-center gap-1 px-3 py-1.5 bg-zinc-700/50 text-zinc-400 border border-zinc-600/50 rounded-md text-xs hover:bg-zinc-700 transition"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}

      {providers.length === 0 && !showAdd && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm mb-2">No AI providers configured</p>
          <p className="text-zinc-600 text-xs">All AI features use ANTHROPIC_API_KEY env var as fallback</p>
        </div>
      )}

      {providers.map(p => (
        <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center">
              {p.slug === 'anthropic' ? <Brain className="w-4 h-4 text-orange-400" /> :
               p.slug === 'openai' ? <Zap className="w-4 h-4 text-green-400" /> :
               p.slug === 'google' ? <Globe className="w-4 h-4 text-blue-400" /> :
               <Shield className="w-4 h-4 text-zinc-400" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">{p.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">{p.slug}</span>
                {p.isValid && (
                  <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                    <Check className="w-3 h-3" /> valid
                  </span>
                )}
                {p.hasKey && !p.isValid && p.lastValidated && (
                  <span className="flex items-center gap-0.5 text-[10px] text-red-400">
                    <AlertCircle className="w-3 h-3" /> invalid
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 mt-0.5">
                Key: {p.hasKey ? p.keyMasked : 'not set'} · {p.models.length} models
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => validateProvider(p.id)}
                disabled={!p.hasKey || validating === p.id}
                className="px-2.5 py-1 rounded-md text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 hover:bg-zinc-700 transition disabled:opacity-50"
              >
                {validating === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Validate'}
              </button>
              <button
                onClick={() => toggleProvider(p.id, !p.isEnabled)}
                disabled={toggling === p.id}
                className={`px-2.5 py-1 rounded-md text-xs border transition disabled:opacity-50 ${
                  p.isEnabled
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}
              >
                {p.isEnabled ? 'Enabled' : 'Disabled'}
              </button>
              <button
                onClick={() => deleteProvider(p.id)}
                className="p-1.5 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Models Section ───────────────────────────────

function ModelsSection({
  providers,
  allModels,
  onRefresh,
}: {
  providers: Provider[];
  allModels: (ProviderModel & { provider: { name: string; slug: string; isEnabled: boolean } })[];
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleModel = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      await fetch(`/api/admin/cockpit/ai-models/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: enabled }),
      });
      onRefresh();
    } finally {
      setToggling(null);
    }
  };

  const deleteModel = async (id: string) => {
    await fetch(`/api/admin/cockpit/ai-models/${id}`, { method: 'DELETE' });
    onRefresh();
  };

  // Group by provider
  const grouped = new Map<string, { provider: Provider; models: typeof allModels }>();
  for (const p of providers) {
    grouped.set(p.id, { provider: p, models: [] });
  }
  for (const m of allModels) {
    const pid = (m as unknown as { providerId: string }).providerId;
    const group = grouped.get(pid);
    if (group) group.models.push(m);
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-300">Models by Provider</h2>

      {Array.from(grouped.values()).map(({ provider: p, models }) => (
        <div key={p.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => toggle(p.id)}
            className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800/30 transition text-left"
          >
            {expanded.has(p.id) ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
            <span className="text-sm font-medium text-zinc-200">{p.name}</span>
            <span className="text-xs text-zinc-500">{models.length} models</span>
            {!p.isEnabled && <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500">disabled</span>}
          </button>
          {expanded.has(p.id) && (
            <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
              {models.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1">
                    <span className="text-xs text-zinc-200">{m.displayName}</span>
                    <span className="text-[10px] text-zinc-500 ml-2">{m.modelId}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500">{(m.contextWindow / 1000).toFixed(0)}k ctx</span>
                  <button
                    onClick={() => toggleModel(m.id, !m.isEnabled)}
                    disabled={toggling === m.id}
                    className={`px-2 py-0.5 rounded text-[10px] border transition disabled:opacity-50 ${
                      m.isEnabled
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-zinc-800 text-zinc-500 border-zinc-700'
                    }`}
                  >
                    {m.isEnabled ? 'on' : 'off'}
                  </button>
                  <button
                    onClick={() => deleteModel(m.id)}
                    className="p-1 text-zinc-500 hover:text-red-400 transition"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {models.length === 0 && (
                <div className="p-3 text-xs text-zinc-500 text-center">No models configured</div>
              )}
            </div>
          )}
        </div>
      ))}

      {providers.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm">Add a provider first to manage models</p>
        </div>
      )}
    </div>
  );
}

// ── Assignments Section ──────────────────────────

function AssignmentsSection({
  assignments,
  allModels,
  onRefresh,
}: {
  assignments: ActivityAssignment[];
  allModels: (ProviderModel & { provider: { name: string; slug: string; isEnabled: boolean } })[];
  onRefresh: () => void;
}) {
  const [edits, setEdits] = useState<Map<string, { modelId: string | null; temperature: number; maxTokens: number; systemPromptOverride: string | null }>>(new Map());
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const enabledModels = allModels.filter(m => m.isEnabled && m.provider.isEnabled);

  const getEdit = (activity: ActivityAssignment) => {
    const edit = edits.get(activity.key);
    if (edit) return edit;
    return {
      modelId: activity.assignment?.modelId || null,
      temperature: activity.assignment?.temperature ?? activity.defaultTemperature,
      maxTokens: activity.assignment?.maxTokens ?? activity.defaultMaxTokens,
      systemPromptOverride: activity.assignment?.systemPromptOverride || null,
    };
  };

  const setEdit = (key: string, field: string, value: unknown) => {
    setEdits(prev => {
      const next = new Map(prev);
      const existing = next.get(key) || {
        modelId: assignments.find(a => a.key === key)?.assignment?.modelId || null,
        temperature: assignments.find(a => a.key === key)?.assignment?.temperature ?? 0.7,
        maxTokens: assignments.find(a => a.key === key)?.assignment?.maxTokens ?? 4096,
        systemPromptOverride: assignments.find(a => a.key === key)?.assignment?.systemPromptOverride || null,
      };
      next.set(key, { ...existing, [field]: value });
      return next;
    });
    setSaved(false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const items = Array.from(edits.entries()).map(([activity, edit]) => ({
        activity,
        modelId: edit.modelId,
        temperature: edit.temperature,
        maxTokens: edit.maxTokens,
        systemPromptOverride: edit.systemPromptOverride,
      }));
      if (items.length === 0) return;
      await fetch('/api/admin/cockpit/ai-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: items }),
      });
      setEdits(new Map());
      setSaved(true);
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  const resetAll = async () => {
    setSaving(true);
    try {
      const items = assignments
        .filter(a => a.assignment)
        .map(a => ({ activity: a.key, modelId: null }));
      if (items.length === 0) return;
      await fetch('/api/admin/cockpit/ai-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: items }),
      });
      setEdits(new Map());
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  // Group by category
  const categories = ['deliberation', 'planning', 'reports', 'issues', 'ci'];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">Activity Assignments</h2>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-400">Saved!</span>}
          <button
            onClick={resetAll}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-400 hover:bg-zinc-700 transition disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" /> Reset All
          </button>
          <button
            onClick={saveAll}
            disabled={saving || edits.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save Changes
          </button>
        </div>
      </div>

      {enabledModels.length === 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs text-amber-400">No enabled models available. Add a provider with models to configure assignments. Using ANTHROPIC_API_KEY env var fallback.</p>
        </div>
      )}

      {categories.map(cat => {
        const catActivities = assignments.filter(a => a.category === cat);
        if (catActivities.length === 0) return null;
        return (
          <div key={cat} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-zinc-800">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${CATEGORY_COLORS[cat] || 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>
                {cat}
              </span>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {catActivities.map(activity => {
                const edit = getEdit(activity);
                const hasPromptOverride = !!edit.systemPromptOverride;
                return (
                  <div key={activity.key}>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-zinc-200">{activity.label}</div>
                        <div className="text-[10px] text-zinc-500 truncate">{activity.description}</div>
                      </div>
                      <button
                        onClick={() => setEdit(activity.key, 'systemPromptOverride', hasPromptOverride ? null : '')}
                        className={`px-1.5 py-1 rounded text-[10px] border transition ${hasPromptOverride ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-zinc-800 text-zinc-500 border-zinc-700 hover:text-zinc-300'}`}
                        title={hasPromptOverride ? 'Remove system prompt override' : 'Add system prompt override'}
                      >
                        Prompt
                      </button>
                      <select
                        value={edit.modelId || ''}
                        onChange={e => setEdit(activity.key, 'modelId', e.target.value || null)}
                        className="bg-zinc-800 border border-zinc-700 rounded-md px-2 py-1 text-[11px] text-zinc-300 focus:outline-none focus:border-zinc-500 max-w-[200px]"
                      >
                        <option value="">Default ({activity.defaultModel})</option>
                        {enabledModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.provider.name}: {m.displayName}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={edit.temperature}
                        onChange={e => setEdit(activity.key, 'temperature', parseFloat(e.target.value) || 0)}
                        step="0.1"
                        min="0"
                        max="2"
                        className="w-14 bg-zinc-800 border border-zinc-700 rounded-md px-1.5 py-1 text-[11px] text-zinc-300 text-center focus:outline-none focus:border-zinc-500"
                        title="Temperature"
                      />
                      <input
                        type="number"
                        value={edit.maxTokens}
                        onChange={e => setEdit(activity.key, 'maxTokens', parseInt(e.target.value) || 1024)}
                        step="256"
                        min="256"
                        className="w-16 bg-zinc-800 border border-zinc-700 rounded-md px-1.5 py-1 text-[11px] text-zinc-300 text-center focus:outline-none focus:border-zinc-500"
                        title="Max tokens"
                      />
                    </div>
                    {hasPromptOverride && (
                      <div className="px-4 pb-2.5">
                        <textarea
                          value={edit.systemPromptOverride || ''}
                          onChange={e => setEdit(activity.key, 'systemPromptOverride', e.target.value || null)}
                          rows={3}
                          placeholder="Custom system prompt override (replaces default when set)..."
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-md px-2.5 py-1.5 text-[11px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 resize-y"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
