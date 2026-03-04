'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import { marked } from 'marked';

marked.use({ gfm: true, breaks: true });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ToolBlock {
  toolUseId: string;
  name: string;
  input: unknown;
  output?: string;
}

export interface MessageData {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolBlocks: ToolBlock[];
  isStreaming?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderMarkdown(text: string): string {
  try {
    return marked.parse(text) as string;
  } catch {
    return text;
  }
}

const TOOL_LABELS: Record<string, string> = {
  list_documentation: 'List Documentation',
  read_documentation: 'Read Documentation',
  get_system_health: 'System Health',
  get_ai_usage: 'AI Usage Stats',
  ssh_exec: 'SSH Execute',
  github_read: 'GitHub Read',
  github_act: 'GitHub Action',
  airflow_api: 'Airflow API',
  stripe_api: 'Stripe API',
  query_admin_db: 'Query Database',
  search_documentation: 'Search Docs',
};

// ── ToolBlock component ───────────────────────────────────────────────────────

function ToolBlockItem({ block }: { block: ToolBlock }) {
  const [open, setOpen] = useState(false);
  const label = TOOL_LABELS[block.name] ?? block.name;
  const isDone = block.output !== undefined;

  return (
    <div className="mt-2 rounded-lg border border-border overflow-hidden text-xs">
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-background-primary hover:bg-background-tertiary transition-colors text-left"
      >
        {isDone ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-accent-secondary flex-shrink-0" />
        ) : (
          <Loader2 className="w-3.5 h-3.5 text-accent-warning animate-spin flex-shrink-0" />
        )}
        <Wrench className="w-3 h-3 text-text-secondary flex-shrink-0" />
        <span className="font-medium text-text-secondary">{label}</span>
        {block.input !== null &&
          block.input !== undefined &&
          typeof block.input === 'object' &&
          Object.keys(block.input as object).length > 0 && (
            <span className="text-text-tertiary ml-1">
              ({Object.values(block.input as Record<string, unknown>)
                .map((v) => String(v).slice(0, 30))
                .join(', ')})
            </span>
          )}
        <span className="ml-auto">
          {open ? (
            <ChevronDown className="w-3 h-3 text-text-tertiary" />
          ) : (
            <ChevronRight className="w-3 h-3 text-text-tertiary" />
          )}
        </span>
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border">
          {/* Input */}
          {block.input !== null &&
            block.input !== undefined &&
            typeof block.input === 'object' &&
            Object.keys(block.input as object).length > 0 && (
            <div className="px-3 py-2 border-b border-border">
              <div className="text-text-tertiary uppercase tracking-wide mb-1" style={{ fontSize: '10px' }}>
                Input
              </div>
              <pre className="text-text-secondary overflow-x-auto whitespace-pre-wrap break-words">
                {JSON.stringify(block.input, null, 2)}
              </pre>
            </div>
          )}
          {/* Output */}
          {block.output !== undefined ? (
            <div className="px-3 py-2">
              <div className="text-text-tertiary uppercase tracking-wide mb-1" style={{ fontSize: '10px' }}>
                Output
              </div>
              <pre className="text-text-secondary overflow-x-auto whitespace-pre-wrap break-words max-h-64">
                {block.output.slice(0, 4000)}
                {block.output.length > 4000 && '\n[truncated in preview]'}
              </pre>
            </div>
          ) : (
            <div className="px-3 py-2 text-text-tertiary flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />
              Running…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message component ─────────────────────────────────────────────────────────

export default function AdminAIMessageItem({ message }: { message: MessageData }) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] bg-accent-primary/20 border border-accent-primary/30 text-text-primary rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm whitespace-pre-wrap"
        >
          {message.content}
        </div>
      </div>
    );
  }

  // Assistant message
  const htmlContent = renderMarkdown(message.content);

  return (
    <div className="flex justify-start">
      <div className="max-w-[95%] w-full">
        {/* Text content — two branches to avoid mixing dangerouslySetInnerHTML with children */}
        {message.content ? (
          <div
            className={[
              'text-sm text-text-primary',
              'bg-background-tertiary rounded-2xl rounded-tl-sm px-4 py-3',
              '[&>p]:mb-2 [&>p:last-child]:mb-0',
              '[&>ul]:mb-2 [&>ul]:list-disc [&>ul]:pl-4 [&>ul>li]:mb-0.5',
              '[&>ol]:mb-2 [&>ol]:list-decimal [&>ol]:pl-4 [&>ol>li]:mb-0.5',
              '[&>h1]:text-base [&>h1]:font-bold [&>h1]:mb-2 [&>h1]:mt-1',
              '[&>h2]:text-sm [&>h2]:font-semibold [&>h2]:mb-1.5 [&>h2]:mt-1',
              '[&>h3]:text-sm [&>h3]:font-medium [&>h3]:mb-1',
              '[&>pre]:bg-background-primary [&>pre]:rounded-lg [&>pre]:p-3 [&>pre]:mb-2 [&>pre]:overflow-x-auto',
              '[&>pre>code]:bg-transparent [&>pre>code]:text-xs [&>pre>code]:text-accent-secondary [&>pre>code]:p-0',
              '[&_code]:bg-background-primary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:text-accent-secondary',
              '[&_strong]:font-semibold',
              '[&_a]:text-accent-primary [&_a]:underline',
              '[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-text-secondary [&_blockquote]:italic [&_blockquote]:my-2',
              '[&>hr]:border-border [&>hr]:my-2',
              '[&>table]:text-xs [&>table]:border-collapse [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
            ].join(' ')}
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        ) : message.isStreaming ? (
          <div className="text-sm text-text-primary bg-background-tertiary rounded-2xl rounded-tl-sm px-4 py-3">
            <span className="inline-block w-2 h-4 bg-accent-primary animate-pulse rounded-sm" />
          </div>
        ) : null}

        {/* Streaming cursor appended to content */}
        {message.isStreaming && message.content && (
          <span className="inline-block w-2 h-3.5 bg-accent-primary animate-pulse rounded-sm ml-0.5 -translate-y-0.5" />
        )}

        {/* Tool blocks */}
        {message.toolBlocks.map((block) => (
          <ToolBlockItem key={block.toolUseId} block={block} />
        ))}
      </div>
    </div>
  );
}
