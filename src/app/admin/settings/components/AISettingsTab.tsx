'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input } from '@/components/ui';
import { Bot, Loader2, Check, AlertCircle, Save, Plus, Trash2, CheckCircle, XCircle, Pencil } from 'lucide-react';

type AIProvider = {
  id: string;
  name: string;
  slug: string;
  keyMasked: string;
  hasKey: boolean;
  baseUrl: string | null;
  isEnabled: boolean;
  isValid: boolean | null;
  lastValidated: string | null;
  models: AIModel[];
};

type AIModel = {
  id: string;
  modelId: string;
  displayName: string;
  capabilities: string | null;
  contextWindow: number;
  costPer1kInput: number;
  costPer1kOutput: number;
  isEnabled: boolean;
  providerId: string;
};

type AIAssignment = {
  activity: string;
  label: string;
  description: string;
  category: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  assignment: {
    modelId: string;
    temperature: number;
    maxTokens: number;
  } | null;
};

type AvailableModel = {
  modelId: string;
  displayName: string;
};

export default function AISettingsTab() {
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [assignments, setAssignments] = useState<AIAssignment[]>([]);
  const [allModels, setAllModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New provider form
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [newProviderSlug, setNewProviderSlug] = useState('anthropic');
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderKey, setNewProviderKey] = useState('');
  const [isAddingProvider, setIsAddingProvider] = useState(false);

  // New model form
  const [showAddModel, setShowAddModel] = useState(false);
  const [newModelProviderId, setNewModelProviderId] = useState('');
  const [newModelId, setNewModelId] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [isAddingModel, setIsAddingModel] = useState(false);

  // Available models from provider API
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isFetchingAvailable, setIsFetchingAvailable] = useState(false);
  const [availableError, setAvailableError] = useState<string | null>(null);

  // Validation
  const [validatingId, setValidatingId] = useState<string | null>(null);

  // Edit provider state
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKey, setEditKey] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Assignment saving
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);
  const [pendingAssignments, setPendingAssignments] = useState<Record<string, string>>({});

  const fetchAll = async () => {
    try {
      setIsLoading(true);
      const [provRes, modelRes, assignRes] = await Promise.all([
        fetch('/api/admin/cockpit/ai-providers'),
        fetch('/api/admin/cockpit/ai-models'),
        fetch('/api/admin/cockpit/ai-assignments'),
      ]);
      if (provRes.ok) {
        const data = await provRes.json();
        setProviders(Array.isArray(data) ? data : data.providers || []);
      }
      if (modelRes.ok) {
        const data = await modelRes.json();
        setAllModels(Array.isArray(data) ? data : data.models || []);
      }
      if (assignRes.ok) {
        const data = await assignRes.json();
        setAssignments(Array.isArray(data) ? data : data.activities || []);
      }
    } catch (err) {
      console.error('Failed to fetch AI settings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const fetchAvailableModels = useCallback(async (providerId: string) => {
    if (!providerId) return;
    try {
      setIsFetchingAvailable(true);
      setAvailableError(null);
      setAvailableModels([]);
      const res = await fetch(`/api/admin/cockpit/ai-providers/${providerId}/models`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch models');
      setAvailableModels(data.models || []);
    } catch (err) {
      setAvailableError(err instanceof Error ? err.message : 'Failed to fetch models');
    } finally {
      setIsFetchingAvailable(false);
    }
  }, []);

  const addProvider = async () => {
    try {
      setIsAddingProvider(true);
      setError(null);
      const res = await fetch('/api/admin/cockpit/ai-providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: newProviderSlug,
          name: newProviderName || newProviderSlug,
          apiKey: newProviderKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add provider');
      setSuccess('Provider added');
      setTimeout(() => setSuccess(null), 3000);
      setShowAddProvider(false);
      setNewProviderSlug('anthropic');
      setNewProviderName('');
      setNewProviderKey('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
    } finally {
      setIsAddingProvider(false);
    }
  };

  const toggleProvider = async (provider: AIProvider) => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/cockpit/ai-providers/${provider.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: !provider.isEnabled }),
      });
      if (!res.ok) throw new Error('Failed to update provider');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    }
  };

  const deleteProvider = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/cockpit/ai-providers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete provider');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  };

  const startEditProvider = (provider: AIProvider) => {
    setEditingProviderId(provider.id);
    setEditName(provider.name);
    setEditKey('');
    setEditBaseUrl(provider.baseUrl || '');
  };

  const saveProviderEdit = async () => {
    if (!editingProviderId) return;
    try {
      setIsSavingEdit(true);
      setError(null);
      const body: Record<string, string> = { name: editName, baseUrl: editBaseUrl };
      if (editKey) body.apiKey = editKey;
      const res = await fetch(`/api/admin/cockpit/ai-providers/${editingProviderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update provider');
      setSuccess('Provider updated');
      setTimeout(() => setSuccess(null), 3000);
      setEditingProviderId(null);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update provider');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const validateProvider = async (id: string) => {
    try {
      setValidatingId(id);
      setError(null);
      const res = await fetch(`/api/admin/cockpit/ai-providers/${id}/validate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Validation failed');
      setSuccess(data.valid ? 'API key is valid' : `Validation failed: ${data.error || 'invalid key'}`);
      setTimeout(() => setSuccess(null), 5000);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setValidatingId(null);
    }
  };

  const addModel = async () => {
    try {
      setIsAddingModel(true);
      setError(null);
      const res = await fetch('/api/admin/cockpit/ai-models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerId: newModelProviderId,
          modelId: newModelId,
          displayName: newModelName || newModelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add model');
      setSuccess('Model added');
      setTimeout(() => setSuccess(null), 3000);
      setShowAddModel(false);
      setNewModelId('');
      setNewModelName('');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add model');
    } finally {
      setIsAddingModel(false);
    }
  };

  const deleteModel = async (id: string) => {
    try {
      setError(null);
      const res = await fetch(`/api/admin/cockpit/ai-models/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete model');
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete model');
    }
  };

  const saveAssignments = async () => {
    try {
      setIsSavingAssignments(true);
      setError(null);
      const updates = Object.entries(pendingAssignments).map(([activity, modelId]) => ({
        activity,
        modelId: modelId || null,
      }));
      if (updates.length === 0) return;
      const res = await fetch('/api/admin/cockpit/ai-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save assignments');
      setSuccess(`Updated ${data.updated} assignment(s)`);
      setTimeout(() => setSuccess(null), 3000);
      setPendingAssignments({});
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save assignments');
    } finally {
      setIsSavingAssignments(false);
    }
  };

  const openAddModel = (providerId?: string) => {
    const pid = providerId || (providers.length > 0 ? providers[0].id : '');
    setShowAddModel(true);
    setNewModelProviderId(pid);
    setNewModelId('');
    setNewModelName('');
    setAvailableModels([]);
    setAvailableError(null);
    if (pid) fetchAvailableModels(pid);
  };

  const changeModelProvider = (pid: string) => {
    setNewModelProviderId(pid);
    setNewModelId('');
    setNewModelName('');
    setAvailableModels([]);
    setAvailableError(null);
    fetchAvailableModels(pid);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  const categories = Array.from(new Set(assignments.map(a => a.category)));

  // Filter out models already added for the selected provider
  const existingModelIds = new Set(
    allModels.filter(m => m.providerId === newModelProviderId).map(m => m.modelId)
  );
  const filteredAvailable = availableModels.filter(m => !existingModelIds.has(m.modelId));

  return (
    <div className="space-y-6">
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500" />
          <span className="text-green-500">{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <span className="text-red-500">{error}</span>
        </div>
      )}

      {/* AI Providers */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Bot className="w-5 h-5 text-purple-500" />
            </div>
            <h2 className="text-lg font-semibold text-text-primary">AI Providers</h2>
          </div>
          <Button variant="secondary" onClick={() => setShowAddProvider(!showAddProvider)}>
            <Plus className="w-4 h-4 mr-2" />Add Provider
          </Button>
        </div>

        {showAddProvider && (
          <div className="p-4 bg-background-tertiary rounded-lg mb-4 space-y-3">
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Provider</label>
                <select
                  value={newProviderSlug}
                  onChange={(e) => setNewProviderSlug(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background-primary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="google">Google</option>
                  <option value="mistral">Mistral</option>
                  <option value="groq">Groq</option>
                </select>
              </div>
              <Input label="Display Name" value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder="(uses slug if empty)" />
              <Input label="API Key" type="password" value={newProviderKey} onChange={(e) => setNewProviderKey(e.target.value)} placeholder="sk-..." />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={addProvider} disabled={isAddingProvider}>
                {isAddingProvider ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add
              </Button>
              <Button variant="ghost" onClick={() => setShowAddProvider(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {providers.length === 0 ? (
            <p className="text-sm text-text-tertiary">No providers configured.</p>
          ) : (
            providers.map(p => (
              <div key={p.id} className="space-y-0">
              <div className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-3">
                <div className="flex items-center gap-3">
                  {p.isValid === true ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : p.isValid === false ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-text-tertiary/30" />
                  )}
                  <div>
                    <p className="text-text-primary font-medium">{p.name} <span className="text-xs text-text-tertiary">({p.slug})</span></p>
                    <p className="text-xs text-text-tertiary">
                      Key: {p.keyMasked || (p.hasKey ? '(encrypted)' : '(none)')} &bull; {p.models?.length || 0} model(s)
                      {p.lastValidated && ` \u2022 Validated ${new Date(p.lastValidated).toLocaleDateString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => startEditProvider(p)}>
                    <Pencil className="w-4 h-4 text-text-secondary" />
                  </Button>
                  <Button variant="ghost" onClick={() => validateProvider(p.id)} disabled={validatingId === p.id}>
                    {validatingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Validate'}
                  </Button>
                  <button
                    onClick={() => toggleProvider(p)}
                    className={`relative w-10 h-5 rounded-full transition-colors ${p.isEnabled ? 'bg-accent-primary' : 'bg-background-secondary'}`}
                  >
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${p.isEnabled ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <Button variant="ghost" onClick={() => deleteProvider(p.id)}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
              {editingProviderId === p.id && (
                <div className="p-4 bg-background-secondary rounded-b-lg border-t border-border space-y-3">
                  <div className="grid md:grid-cols-3 gap-4">
                    <Input label="Display Name" value={editName} onChange={(e) => setEditName(e.target.value)} />
                    <Input label="New API Key (leave blank to keep)" type="password" value={editKey} onChange={(e) => setEditKey(e.target.value)} placeholder="(unchanged)" />
                    <Input label="Base URL (optional)" value={editBaseUrl} onChange={(e) => setEditBaseUrl(e.target.value)} placeholder="https://api.example.com" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={saveProviderEdit} disabled={isSavingEdit}>
                      {isSavingEdit ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                      Save
                    </Button>
                    <Button variant="ghost" onClick={() => setEditingProviderId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* AI Models */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">Models</h2>
          <Button variant="secondary" onClick={() => openAddModel()}>
            <Plus className="w-4 h-4 mr-2" />Add Model
          </Button>
        </div>

        {showAddModel && (
          <div className="p-4 bg-background-tertiary rounded-lg mb-4 space-y-3">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">Provider</label>
                <select
                  value={newModelProviderId}
                  onChange={(e) => changeModelProvider(e.target.value)}
                  className="w-full px-4 py-2.5 bg-background-primary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary"
                >
                  {providers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Model {isFetchingAvailable && <Loader2 className="w-3 h-3 inline animate-spin ml-1" />}
                </label>
                {availableError ? (
                  <div className="space-y-2">
                    <p className="text-xs text-red-400">{availableError}</p>
                    <Input label="" value={newModelId} onChange={(e) => { setNewModelId(e.target.value); setNewModelName(e.target.value); }} placeholder="Enter model ID manually" />
                  </div>
                ) : (
                  <select
                    value={newModelId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setNewModelId(id);
                      const match = availableModels.find(m => m.modelId === id);
                      setNewModelName(match?.displayName || id);
                    }}
                    disabled={isFetchingAvailable}
                    className="w-full px-4 py-2.5 bg-background-primary border border-border rounded-lg text-text-primary focus:outline-none focus:border-accent-primary disabled:opacity-50"
                  >
                    <option value="">
                      {isFetchingAvailable ? 'Fetching models from API...' : `Select a model (${filteredAvailable.length} available)`}
                    </option>
                    {filteredAvailable.map(m => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.displayName !== m.modelId ? `${m.displayName} (${m.modelId})` : m.modelId}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" onClick={addModel} disabled={isAddingModel || !newModelId}>
                {isAddingModel ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Add
              </Button>
              <Button variant="ghost" onClick={() => setShowAddModel(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {allModels.length === 0 ? (
            <p className="text-sm text-text-tertiary">No models configured.</p>
          ) : (
            allModels.map(m => (
              <div key={m.id} className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-2">
                <div>
                  <p className="text-text-primary text-sm font-medium">{m.displayName} <span className="text-xs text-text-tertiary">({m.modelId})</span></p>
                  <p className="text-xs text-text-tertiary">
                    Context: {(m.contextWindow / 1000).toFixed(0)}k &bull;
                    Cost: ${m.costPer1kInput}/1k in, ${m.costPer1kOutput}/1k out
                  </p>
                </div>
                <Button variant="ghost" onClick={() => deleteModel(m.id)}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            ))
          )}
        </div>
      </Card>

      {/* Activity Assignments */}
      <Card>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text-primary">Activity Assignments</h2>
          {Object.keys(pendingAssignments).length > 0 && (
            <Button variant="primary" onClick={saveAssignments} disabled={isSavingAssignments}>
              {isSavingAssignments ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save ({Object.keys(pendingAssignments).length})
            </Button>
          )}
        </div>

        <p className="text-sm text-text-secondary mb-4">
          Assign specific models to each AI activity. Unassigned activities use their default model.
        </p>

        {categories.map(cat => (
          <div key={cat} className="mb-6">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wider mb-2">{cat}</h3>
            <div className="space-y-2">
              {assignments.filter(a => a.category === cat).map(a => {
                const currentModelId = pendingAssignments[a.activity] ?? a.assignment?.modelId ?? '';
                return (
                  <div key={a.activity} className="flex items-center justify-between bg-background-tertiary rounded-lg px-4 py-2">
                    <div className="min-w-0 flex-1 mr-4">
                      <p className="text-sm text-text-primary font-medium truncate">{a.label}</p>
                      <p className="text-xs text-text-tertiary truncate">{a.description}</p>
                    </div>
                    <select
                      value={currentModelId}
                      onChange={(e) => setPendingAssignments(prev => ({ ...prev, [a.activity]: e.target.value }))}
                      className="w-64 px-3 py-1.5 bg-background-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                    >
                      <option value="">Default ({a.defaultModel})</option>
                      {allModels.map(m => (
                        <option key={m.id} value={m.id}>{m.displayName}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
