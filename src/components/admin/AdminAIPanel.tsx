'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
} from 'react';
import {
  Bot,
  X,
  Send,
  RotateCcw,
  History,
  ChevronDown,
  MessageSquare,
  Trash2,
  Settings,
} from 'lucide-react';
import { useAdminAI } from './AdminAIContext';
import AdminAIMessageItem, { type MessageData, type ToolBlock } from './AdminAIMessageItem';

// ── Helpers ───────────────────────────────────────────────────────────────────

// crypto.randomUUID() requires a secure context (HTTPS). The admin panel is
// accessed over HTTP on the LAN, so we use a fallback UUID v4 implementation.
function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MODELS = [
  { id: 'claude-opus-4-6', label: 'Opus 4.6', note: 'Default' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', note: 'Faster' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: 'Fastest' },
] as const;

// Cost per 1M tokens (USD) — approximate Anthropic list prices
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-6':           { input: 15,   output: 75   },
  'claude-sonnet-4-6':         { input: 3,    output: 15   },
  'claude-haiku-4-5-20251001': { input: 0.25, output: 1.25 },
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationSummary {
  id: string;
  title: string;
  page: string | null;
  messageCount: number;
  updatedAt: string;
}

type SSEEvent =
  | { type: 'token'; text: string }
  | { type: 'tool_start'; tool: string; toolUseId: string; input: unknown }
  | { type: 'tool_result'; tool: string; toolUseId: string; output: string }
  | { type: 'done'; conversationId: string; messageId: string; inputTokens: number; outputTokens: number }
  | { type: 'error'; error: string };

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminAIPanel() {
  const { isPanelOpen, closePanel, pageContext, togglePanel } = useAdminAI();

  const [messages, setMessages] = useState<MessageData[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tokenInfo, setTokenInfo] = useState<{ in: number; out: number } | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // ── Auto-scroll ───────────────────────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Keyboard shortcut (Cmd/Ctrl + Shift + A) ─────────────────────────────

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        togglePanel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [togglePanel]);

  // ── Click-outside for dropdowns ───────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
        setShowModelMenu(false);
      }
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Load history list ─────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/admin/ai/conversations?limit=20');
      if (res.ok) {
        const data = await res.json() as { conversations: ConversationSummary[] };
        setConversations(data.conversations);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // ── Load a past conversation ──────────────────────────────────────────────

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/admin/ai/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json() as {
        id: string;
        messages: Array<{
          id: string;
          role: string;
          content: string;
          toolCalls: Array<{ id: string; name: string; input: unknown }> | null;
          toolResults: Array<{ toolUseId: string; name: string; output: string }> | null;
        }>;
      };

      const loaded: MessageData[] = data.messages
        .filter((m) => !(m.role === 'user' && m.toolResults))
        .map((m) => {
          const toolBlocks: ToolBlock[] = [];
          if (m.toolCalls) {
            for (const tc of m.toolCalls) {
              const result = m.toolResults?.find((tr) => tr.toolUseId === tc.id);
              toolBlocks.push({
                toolUseId: tc.id,
                name: tc.name,
                input: tc.input,
                output: result?.output,
              });
            }
          }
          return {
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content,
            toolBlocks,
          };
        });

      setMessages(loaded);
      setConversationId(data.id);
      setShowHistory(false);
    } catch {
      // ignore
    }
  }, []);

  // ── Delete a conversation ─────────────────────────────────────────────────

  const deleteConversation = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      await fetch(`/api/admin/ai/conversations/${id}`, { method: 'DELETE' });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        newConversation();
      }
    },
    [conversationId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── New conversation ──────────────────────────────────────────────────────

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(null);
    setTokenInfo(null);
    setIsStreaming(false);
    setInput('');
    setShowHistory(false);
  }, []);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput('');
    setTokenInfo(null);

    // Add user message
    const userMsg: MessageData = {
      id: generateId(),
      role: 'user',
      content: text,
      toolBlocks: [],
    };
    // Add empty assistant placeholder
    const assistantId = generateId();
    const assistantMsg: MessageData = {
      id: assistantId,
      role: 'assistant',
      content: '',
      toolBlocks: [],
      isStreaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/admin/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: text,
          pageContext,
          modelOverride: selectedModel !== MODELS[0].id ? selectedModel : null,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: SSEEvent;
          try {
            event = JSON.parse(line.slice(6)) as SSEEvent;
          } catch {
            continue;
          }

          if (event.type === 'token') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + event.text } : m,
              ),
            );
          } else if (event.type === 'tool_start') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolBlocks: [
                        ...m.toolBlocks,
                        { toolUseId: event.toolUseId, name: event.tool, input: event.input },
                      ],
                    }
                  : m,
              ),
            );
          } else if (event.type === 'tool_result') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      toolBlocks: m.toolBlocks.map((b) =>
                        b.toolUseId === event.toolUseId ? { ...b, output: event.output } : b,
                      ),
                    }
                  : m,
              ),
            );
          } else if (event.type === 'done') {
            setConversationId(event.conversationId);
            setTokenInfo({ in: event.inputTokens, out: event.outputTokens });
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, isStreaming: false } : m,
              ),
            );
            setIsStreaming(false);
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content:
                        (m.content || '') +
                        `\n\n**Error:** ${event.error}`,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            setIsStreaming(false);
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: (m.content || '') + `\n\n**Error:** ${(err as Error).message}`,
                isStreaming: false,
              }
            : m,
        ),
      );
      setIsStreaming(false);
    }
  }, [input, isStreaming, conversationId, pageContext, selectedModel]);

  // ── Textarea key handler ──────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  };

  // ── Auto-resize textarea ──────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  };

  // ── Stop generation ───────────────────────────────────────────────────────

  const stopGeneration = () => {
    abortRef.current?.abort();
    setMessages((prev) =>
      prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)),
    );
    setIsStreaming(false);
  };

  // ── Current model label ───────────────────────────────────────────────────

  const currentModel = MODELS.find((m) => m.id === selectedModel) ?? MODELS[0];

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isPanelOpen) return null;

  return (
    <div className="fixed right-0 top-0 h-screen w-[380px] bg-background-secondary border-l border-border flex flex-col z-40">
      {/* ── Header ── */}
      <div className="flex-shrink-0 border-b border-border">
        {/* Title row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Bot className="w-4 h-4 text-accent-primary flex-shrink-0" />
          <span className="font-semibold text-sm text-text-primary flex-1 min-w-0 truncate">
            AI Assistant
          </span>

          {/* Model selector */}
          <div className="relative" ref={modelMenuRef}>
            <button
              onClick={() => setShowModelMenu((v) => !v)}
              className="flex items-center gap-1 text-xs bg-background-tertiary hover:bg-border px-2 py-1 rounded-md text-text-secondary hover:text-text-primary transition-colors"
            >
              {currentModel.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showModelMenu && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-background-secondary border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedModel(m.id); setShowModelMenu(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-background-tertiary transition-colors ${
                      m.id === selectedModel ? 'text-accent-primary' : 'text-text-primary'
                    }`}
                  >
                    <span>{m.label}</span>
                    <span className="text-text-tertiary">{m.note}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History button */}
          <div className="relative" ref={historyRef}>
            <button
              onClick={() => {
                if (!showHistory) void loadHistory();
                setShowHistory((v) => !v);
              }}
              title="Conversation history"
              className="p-1.5 rounded-md hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
            >
              <History className="w-4 h-4" />
            </button>
            {showHistory && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-background-secondary border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                  <span className="text-xs font-medium text-text-primary">Recent conversations</span>
                  <button
                    onClick={newConversation}
                    className="text-xs text-accent-primary hover:text-accent-primary/80 transition-colors flex items-center gap-1"
                  >
                    <MessageSquare className="w-3 h-3" /> New
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {historyLoading ? (
                    <div className="px-3 py-4 text-xs text-text-tertiary text-center">Loading…</div>
                  ) : conversations.length === 0 ? (
                    <div className="px-3 py-4 text-xs text-text-tertiary text-center">No conversations yet</div>
                  ) : (
                    conversations.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => void loadConversation(c.id)}
                        className="w-full flex items-start gap-2 px-3 py-2.5 hover:bg-background-tertiary transition-colors group text-left border-b border-border/50 last:border-0"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-text-primary truncate">{c.title}</div>
                          {c.page && (
                            <div className="text-xs text-text-tertiary truncate">{c.page}</div>
                          )}
                        </div>
                        <button
                          onClick={(e) => void deleteConversation(c.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-accent-danger transition-all text-text-tertiary"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* New conversation */}
          <button
            onClick={newConversation}
            title="New conversation"
            className="p-1.5 rounded-md hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Settings */}
          <a
            href="/admin/settings?tab=admin-ai"
            title="AI Assistant settings"
            className="p-1.5 rounded-md hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
          </a>

          {/* Close */}
          <button
            onClick={closePanel}
            title="Close panel (Cmd+Shift+A)"
            className="p-1.5 rounded-md hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Page context banner */}
        {pageContext && (
          <div className="px-3 py-1.5 bg-accent-primary/10 border-t border-accent-primary/20 text-xs text-accent-primary/80 truncate">
            <span className="font-medium">{pageContext.page}</span>
            {pageContext.summary && (
              <span className="text-text-tertiary"> — {pageContext.summary}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-8">
            <Bot className="w-10 h-10 text-text-tertiary mb-3" />
            <p className="text-sm font-medium text-text-secondary mb-1">
              How can I help?
            </p>
            <p className="text-xs text-text-tertiary max-w-[220px]">
              Ask anything about the system, infrastructure, data, or documentation.
            </p>
            <div className="mt-4 space-y-2 w-full max-w-[260px]">
              {[
                'Show current system health',
                'What does the ZK vault auth flow look like?',
                'How much did AI cost this week?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); textareaRef.current?.focus(); }}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-background-tertiary hover:bg-border text-text-secondary hover:text-text-primary transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <AdminAIMessageItem key={msg.id} message={msg} />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      <div className="flex-shrink-0 border-t border-border p-3">
        <div className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-background-tertiary border border-border rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-accent-primary/50 resize-none min-h-[40px] max-h-[140px] disabled:opacity-50 transition-colors"
            style={{ height: '40px' }}
          />
          {isStreaming ? (
            <button
              onClick={stopGeneration}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-danger/20 hover:bg-accent-danger/30 text-accent-danger transition-colors flex items-center justify-center"
              title="Stop generation"
            >
              <div className="w-3 h-3 rounded-sm bg-accent-danger" />
            </button>
          ) : (
            <button
              onClick={() => void sendMessage()}
              disabled={!input.trim()}
              className="flex-shrink-0 w-9 h-9 rounded-xl bg-accent-primary hover:bg-accent-primary/80 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center"
              title="Send (Enter)"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Footer info — model picker (left) + token stats (right) */}
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          {/* Model select */}
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isStreaming}
            className="text-xs bg-background-tertiary border border-border rounded-md px-2 py-1 text-text-secondary focus:outline-none focus:border-accent-primary/50 disabled:opacity-40 cursor-pointer transition-colors"
          >
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.note}
              </option>
            ))}
          </select>

          {/* Token display / status */}
          <span className="text-xs text-text-tertiary">
            {isStreaming ? (
              <span className="text-accent-secondary animate-pulse">Generating…</span>
            ) : tokenInfo ? (
              <span className="relative group cursor-default select-none">
                <span>{(tokenInfo.in + tokenInfo.out).toLocaleString()} tokens</span>
                {/* Hover popup */}
                <div className="absolute bottom-full right-0 mb-2 w-56 bg-background-secondary border border-border rounded-lg shadow-xl p-3 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 z-50">
                  <div className="font-medium text-text-primary text-xs mb-2">{currentModel.label}</div>
                  <div className="space-y-1.5 text-xs text-text-secondary">
                    <div className="flex justify-between gap-3">
                      <span>Input tokens</span>
                      <span className="font-mono">
                        {tokenInfo.in.toLocaleString()}
                        <span className="text-text-tertiary ml-1">
                          ≈ ${((tokenInfo.in / 1_000_000) * (MODEL_RATES[selectedModel]?.input ?? 0)).toFixed(4)}
                        </span>
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Output tokens</span>
                      <span className="font-mono">
                        {tokenInfo.out.toLocaleString()}
                        <span className="text-text-tertiary ml-1">
                          ≈ ${((tokenInfo.out / 1_000_000) * (MODEL_RATES[selectedModel]?.output ?? 0)).toFixed(4)}
                        </span>
                      </span>
                    </div>
                    <div className="border-t border-border pt-1.5 flex justify-between gap-3 font-medium text-text-primary">
                      <span>Total</span>
                      <span className="font-mono">
                        {(tokenInfo.in + tokenInfo.out).toLocaleString()}
                        <span className="text-text-tertiary font-normal ml-1">
                          ≈ ${(
                            (tokenInfo.in / 1_000_000) * (MODEL_RATES[selectedModel]?.input ?? 0) +
                            (tokenInfo.out / 1_000_000) * (MODEL_RATES[selectedModel]?.output ?? 0)
                          ).toFixed(4)}
                        </span>
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-text-tertiary" style={{ fontSize: '10px' }}>
                    Enter to send · Shift+Enter for newline
                  </div>
                </div>
              </span>
            ) : (
              conversationId ? 'Conversation active' : 'Cmd+Shift+A to toggle'
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
