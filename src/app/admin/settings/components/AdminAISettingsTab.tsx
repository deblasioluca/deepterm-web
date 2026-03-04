'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Save,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Terminal,
  Github,
  Zap,
  Database,
  Search,
  Activity,
  DollarSign,
  Server,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Prompt {
  name: string;
  content: string;
  shortcut?: string;
}

interface ToolPermissions {
  [key: string]: boolean;
}

interface Settings {
  modelId: string;
  systemPrompt: string | null;
  additionalPrompts: Prompt[];
  toolPermissions: ToolPermissions;
  hasGithubPat: boolean;
  githubPatMasked: string | null;
  hasVoyageApiKey: boolean;
  voyageApiKeyMasked: string | null;
  maxTokensPerMessage: number;
  conversationTtlDays: number;
}

// ── Tool metadata ─────────────────────────────────────────────────────────────

const TOOL_GROUPS: Array<{
  label: string;
  icon: React.FC<{ className?: string }>;
  tools: Array<{ name: string; label: string; description: string }>;
}> = [
  {
    label: 'Documentation',
    icon: Database,
    tools: [
      { name: 'list_documentation', label: 'List docs', description: 'List files in Documentation/' },
      { name: 'read_documentation', label: 'Read doc file', description: 'Read full documentation file' },
      { name: 'search_documentation', label: 'Vector search', description: 'Semantic search across indexed docs' },
      { name: 'index_documentation', label: 'Index doc', description: 'Chunk + embed a doc into vector store' },
      { name: 'list_indexed_documents', label: 'List indexed', description: 'Show what is in the vector store' },
    ],
  },
  {
    label: 'System',
    icon: Activity,
    tools: [
      { name: 'get_system_health', label: 'System health', description: 'DB counts, memory, uptime' },
      { name: 'get_ai_usage', label: 'AI usage', description: 'Cost and token usage stats' },
    ],
  },
  {
    label: 'SSH',
    icon: Terminal,
    tools: [
      { name: 'ssh_exec', label: 'SSH exec', description: 'Run shell commands on webapp RPi' },
    ],
  },
  {
    label: 'GitHub',
    icon: Github,
    tools: [
      { name: 'github_read', label: 'GitHub read', description: 'Read repos, issues, PRs, workflows' },
      { name: 'github_act', label: 'GitHub write', description: 'Create issues, comments, trigger workflows' },
    ],
  },
  {
    label: 'Infrastructure',
    icon: Server,
    tools: [
      { name: 'airflow_api', label: 'Airflow', description: 'List/trigger/pause DAGs' },
      { name: 'node_red_api', label: 'Node-RED', description: 'List flows, send webhooks' },
    ],
  },
  {
    label: 'Billing',
    icon: DollarSign,
    tools: [
      { name: 'stripe_api', label: 'Stripe', description: 'Revenue, subscriptions, customers' },
    ],
  },
];

const ALL_TOOLS = TOOL_GROUPS.flatMap((g) => g.tools.map((t) => t.name));

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (most capable)' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (balanced)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAISettingsTab() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Dirty state for each section
  const [modelId, setModelId] = useState('claude-opus-4-6');
  const [systemPrompt, setSystemPrompt] = useState<string>('');
  const [useSystemPrompt, setUseSystemPrompt] = useState(false);
  const [maxTokens, setMaxTokens] = useState(8000);
  const [ttlDays, setTtlDays] = useState(30);
  const [toolPerms, setToolPerms] = useState<ToolPermissions>({});
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  // New key input state
  const [githubPat, setGithubPat] = useState('');
  const [showGithubPat, setShowGithubPat] = useState(false);
  const [voyageKey, setVoyageKey] = useState('');
  const [showVoyageKey, setShowVoyageKey] = useState(false);
  const [clearGithubPat, setClearGithubPat] = useState(false);
  const [clearVoyageKey, setClearVoyageKey] = useState(false);

  // Expanded tool groups
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(['Documentation', 'System', 'SSH', 'GitHub']),
  );

  // New prompt form
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [newPromptName, setNewPromptName] = useState('');
  const [newPromptContent, setNewPromptContent] = useState('');
  const [newPromptShortcut, setNewPromptShortcut] = useState('');

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/ai/settings');
      if (!res.ok) throw new Error('Failed to load settings');
      const data: Settings = await res.json();
      setSettings(data);
      setModelId(data.modelId);
      setSystemPrompt(data.systemPrompt ?? '');
      setUseSystemPrompt(!!data.systemPrompt);
      setMaxTokens(data.maxTokensPerMessage);
      setTtlDays(data.conversationTtlDays);
      setToolPerms(data.toolPermissions);
      setPrompts(data.additionalPrompts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const body: Record<string, unknown> = {
        modelId,
        systemPrompt: useSystemPrompt ? (systemPrompt || null) : null,
        additionalPrompts: prompts,
        toolPermissions: toolPerms,
        maxTokensPerMessage: maxTokens,
        conversationTtlDays: ttlDays,
      };

      if (clearGithubPat) {
        body.clearGithubPat = true;
      } else if (githubPat.trim()) {
        body.githubPat = githubPat.trim();
      }

      if (clearVoyageKey) {
        body.clearVoyageApiKey = true;
      } else if (voyageKey.trim()) {
        body.voyageApiKey = voyageKey.trim();
      }

      const res = await fetch('/api/admin/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? 'Save failed');
      }

      setSuccess('Settings saved');
      setGithubPat('');
      setVoyageKey('');
      setClearGithubPat(false);
      setClearVoyageKey(false);
      setTimeout(() => setSuccess(null), 4000);
      await fetchSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const setAllTools = (enabled: boolean) => {
    const next: ToolPermissions = {};
    for (const name of ALL_TOOLS) next[name] = enabled;
    setToolPerms(next);
  };

  const isToolEnabled = (name: string): boolean => {
    if (name in toolPerms) return toolPerms[name];
    return true; // default enabled
  };

  const addPrompt = () => {
    if (!newPromptName.trim() || !newPromptContent.trim()) return;
    setPrompts((prev) => [
      ...prev,
      {
        name: newPromptName.trim(),
        content: newPromptContent.trim(),
        shortcut: newPromptShortcut.trim() || undefined,
      },
    ]);
    setNewPromptName('');
    setNewPromptContent('');
    setNewPromptShortcut('');
    setAddingPrompt(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Feedback banners */}
      {success && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-3">
          <Check className="w-5 h-5 text-green-500 shrink-0" />
          <span className="text-sm text-green-500">{success}</span>
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm text-red-500">{error}</span>
        </div>
      )}

      {/* ── Model + limits ─────────────────────────────────── */}
      <section className="bg-background-secondary border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Bot className="w-4 h-4 text-accent-primary" />
          <h2 className="text-sm font-semibold text-text-primary">Model</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Default model
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Max tokens / message
            </label>
            <input
              type="number"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Math.max(1024, parseInt(e.target.value) || 8000))}
              min={1024}
              max={64000}
              step={1000}
              className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Conversation history (days)
            </label>
            <input
              type="number"
              value={ttlDays}
              onChange={(e) => setTtlDays(Math.max(1, parseInt(e.target.value) || 30))}
              min={1}
              max={365}
              className="w-full px-3 py-2 bg-background-primary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
            />
          </div>
        </div>
      </section>

      {/* ── System prompt ─────────────────────────────────── */}
      <section className="bg-background-secondary border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">System Prompt</h2>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-text-secondary">
              {useSystemPrompt ? 'Custom override active' : 'Using CLAUDE.md (default)'}
            </span>
            <button
              onClick={() => setUseSystemPrompt((v) => !v)}
              className={`relative w-10 h-5 rounded-full transition-colors ${useSystemPrompt ? 'bg-accent-primary' : 'bg-zinc-700 border border-zinc-600'}`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${useSystemPrompt ? 'left-5' : 'left-0.5'}`}
              />
            </button>
          </label>
        </div>

        {useSystemPrompt ? (
          <div>
            <p className="text-xs text-text-tertiary mb-2">
              This text replaces the entire CLAUDE.md content as the system prompt. The role block
              and page context are still appended automatically.
            </p>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={10}
              placeholder="# Custom System Prompt&#10;&#10;You are an expert DevOps assistant for the DeepTerm platform..."
              className="w-full px-3 py-2.5 bg-background-primary border border-border rounded-lg text-sm text-text-primary font-mono placeholder-text-tertiary focus:outline-none focus:border-accent-primary resize-y"
            />
          </div>
        ) : (
          <p className="text-xs text-text-tertiary">
            The AI reads <code className="bg-background-primary px-1 py-0.5 rounded">CLAUDE.md</code> from
            the project root on every request. Toggle the switch above to override it.
          </p>
        )}
      </section>

      {/* ── Prompt library ─────────────────────────────────── */}
      <section className="bg-background-secondary border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Prompt Library</h2>
          </div>
          <button
            onClick={() => setAddingPrompt((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-background-tertiary border border-border rounded-lg text-xs text-text-secondary hover:text-text-primary hover:bg-border transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Prompt
          </button>
        </div>

        <p className="text-xs text-text-tertiary">
          Saved prompts appear as quick-start buttons in the panel. Shortcuts display as labels.
        </p>

        {addingPrompt && (
          <div className="bg-background-primary border border-border rounded-lg p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Name</label>
                <input
                  type="text"
                  value={newPromptName}
                  onChange={(e) => setNewPromptName(e.target.value)}
                  placeholder="e.g. System health check"
                  className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Shortcut label (optional)
                </label>
                <input
                  type="text"
                  value={newPromptShortcut}
                  onChange={(e) => setNewPromptShortcut(e.target.value)}
                  placeholder="e.g. /health"
                  className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">
                Prompt content
              </label>
              <textarea
                value={newPromptContent}
                onChange={(e) => setNewPromptContent(e.target.value)}
                rows={3}
                placeholder="Check system health and summarise for me..."
                className="w-full px-3 py-2 bg-background-secondary border border-border rounded-lg text-sm text-text-primary focus:outline-none focus:border-accent-primary resize-y"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={addPrompt}
                disabled={!newPromptName.trim() || !newPromptContent.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-primary/20 text-accent-primary border border-accent-primary/30 rounded-lg text-xs font-medium hover:bg-accent-primary/30 transition disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
              <button
                onClick={() => setAddingPrompt(false)}
                className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {prompts.length === 0 && !addingPrompt ? (
          <p className="text-xs text-text-tertiary italic">No prompts saved yet.</p>
        ) : (
          <div className="space-y-2">
            {prompts.map((p, i) => (
              <div
                key={i}
                className="flex items-start justify-between bg-background-primary border border-border rounded-lg px-3 py-2.5 gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-primary font-medium truncate">
                      {p.name}
                    </span>
                    {p.shortcut && (
                      <span className="px-1.5 py-0.5 rounded bg-background-tertiary border border-border text-[10px] text-text-tertiary font-mono">
                        {p.shortcut}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-tertiary mt-0.5 truncate">{p.content}</p>
                </div>
                <button
                  onClick={() => setPrompts((prev) => prev.filter((_, idx) => idx !== i))}
                  className="shrink-0 p-1 text-text-tertiary hover:text-red-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tool permissions ──────────────────────────────── */}
      <section className="bg-background-secondary border border-border rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent-primary" />
            <h2 className="text-sm font-semibold text-text-primary">Tool Permissions</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAllTools(true)}
              className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary bg-background-primary border border-border rounded-md transition"
            >
              Enable all
            </button>
            <button
              onClick={() => setAllTools(false)}
              className="px-2.5 py-1 text-xs text-text-secondary hover:text-text-primary bg-background-primary border border-border rounded-md transition"
            >
              Disable all
            </button>
          </div>
        </div>

        <p className="text-xs text-text-tertiary">
          Disabled tools are hidden from the AI entirely. Unmodified tools default to enabled.
        </p>

        <div className="space-y-1">
          {TOOL_GROUPS.map((group) => {
            const Icon = group.icon;
            const expanded = expandedGroups.has(group.label);
            return (
              <div
                key={group.label}
                className="bg-background-primary border border-border rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-background-tertiary transition text-left"
                >
                  {expanded ? (
                    <ChevronDown className="w-3.5 h-3.5 text-text-tertiary" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-text-tertiary" />
                  )}
                  <Icon className="w-3.5 h-3.5 text-text-secondary" />
                  <span className="text-xs font-medium text-text-secondary">{group.label}</span>
                  <span className="ml-auto text-[10px] text-text-tertiary">
                    {group.tools.filter((t) => isToolEnabled(t.name)).length}/{group.tools.length}{' '}
                    enabled
                  </span>
                </button>
                {expanded && (
                  <div className="border-t border-border divide-y divide-border/50">
                    {group.tools.map((tool) => (
                      <div
                        key={tool.name}
                        className="flex items-center justify-between px-4 py-2.5"
                      >
                        <div>
                          <p className="text-xs text-text-primary font-medium">{tool.label}</p>
                          <p className="text-[10px] text-text-tertiary">{tool.description}</p>
                        </div>
                        <button
                          onClick={() =>
                            setToolPerms((prev) => ({
                              ...prev,
                              [tool.name]: !isToolEnabled(tool.name),
                            }))
                          }
                          className={`relative w-9 h-5 rounded-full transition-colors ${
                            isToolEnabled(tool.name)
                              ? 'bg-accent-primary'
                              : 'bg-zinc-600 border border-zinc-500'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-transform ${
                              isToolEnabled(tool.name) ? 'left-5' : 'left-0.5'
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── API Keys ──────────────────────────────────────── */}
      <section className="bg-background-secondary border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Github className="w-4 h-4 text-accent-primary" />
          <h2 className="text-sm font-semibold text-text-primary">API Keys</h2>
        </div>

        <p className="text-xs text-text-tertiary">
          Keys are encrypted at rest using AES-256-GCM. Leave the field blank to keep the current
          key unchanged.
        </p>

        {/* GitHub PAT */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-text-primary">GitHub PAT</label>
              <p className="text-[10px] text-text-tertiary">
                Required scopes: repo, workflow, read:org, read:user
              </p>
            </div>
            {settings?.hasGithubPat && !clearGithubPat && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary font-mono">
                  Current: {settings.githubPatMasked}
                </span>
                <button
                  onClick={() => setClearGithubPat(true)}
                  className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-0.5"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              </div>
            )}
            {clearGithubPat && (
              <button
                onClick={() => setClearGithubPat(false)}
                className="text-[10px] text-text-secondary hover:text-text-primary"
              >
                Cancel clear
              </button>
            )}
          </div>
          {clearGithubPat ? (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              GitHub PAT will be removed on save.
            </div>
          ) : (
            <div className="relative">
              <input
                type={showGithubPat ? 'text' : 'password'}
                value={githubPat}
                onChange={(e) => setGithubPat(e.target.value)}
                placeholder={
                  settings?.hasGithubPat ? 'Enter new key to replace...' : 'github_pat_...'
                }
                className="w-full px-3 py-2 pr-10 bg-background-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
              <button
                onClick={() => setShowGithubPat((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              >
                {showGithubPat ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>

        {/* Voyage API key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-xs font-medium text-text-primary">Voyage AI API Key</label>
              <p className="text-[10px] text-text-tertiary">
                Used for document vector embeddings (voyage-3-large). Also configurable via{' '}
                <code className="bg-background-primary px-1 rounded">VOYAGE_API_KEY</code> env var.
              </p>
            </div>
            {settings?.hasVoyageApiKey && !clearVoyageKey && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-text-tertiary font-mono">
                  Current: {settings.voyageApiKeyMasked}
                </span>
                <button
                  onClick={() => setClearVoyageKey(true)}
                  className="text-[10px] text-red-400 hover:text-red-300 flex items-center gap-0.5"
                >
                  <RotateCcw className="w-3 h-3" /> Clear
                </button>
              </div>
            )}
            {clearVoyageKey && (
              <button
                onClick={() => setClearVoyageKey(false)}
                className="text-[10px] text-text-secondary hover:text-text-primary"
              >
                Cancel clear
              </button>
            )}
          </div>
          {clearVoyageKey ? (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
              Voyage API key will be removed on save.
            </div>
          ) : (
            <div className="relative">
              <input
                type={showVoyageKey ? 'text' : 'password'}
                value={voyageKey}
                onChange={(e) => setVoyageKey(e.target.value)}
                placeholder={
                  settings?.hasVoyageApiKey ? 'Enter new key to replace...' : 'pa-...'
                }
                className="w-full px-3 py-2 pr-10 bg-background-primary border border-border rounded-lg text-sm text-text-primary font-mono focus:outline-none focus:border-accent-primary"
              />
              <button
                onClick={() => setShowVoyageKey((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
              >
                {showVoyageKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ── Save button ────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-primary text-white rounded-lg text-sm font-medium hover:bg-accent-primary-hover transition disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Settings
        </button>
      </div>
    </div>
  );
}
