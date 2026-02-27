'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Play, FastForward, Trash2, X, ChevronDown, ChevronRight, AlertTriangle, ExternalLink } from 'lucide-react';
import type { DeliberationDetail } from '../types';
import { formatTimeAgo } from '../utils';

// ── Agent colors ──

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Architect:              { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  'Security Engineer':    { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  Pragmatist:             { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  'Performance Engineer': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
};

const AGENT_ICONS: Record<string, string> = {
  Architect: '🏗️',
  'Security Engineer': '🔒',
  Pragmatist: '⚡',
  'Performance Engineer': '🚀',
};

function agentStyle(name: string) {
  return AGENT_COLORS[name] || { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-500/30' };
}

// ── Status badge ──

const STATUS_STYLES: Record<string, string> = {
  proposing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  debating: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  voting: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  decided: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  implementing: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  failed: 'bg-red-500/20 text-red-400 border-red-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const spinning = ['proposing', 'debating', 'voting', 'implementing'].includes(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${STATUS_STYLES[status] || STATUS_STYLES.proposing}`}>
      {spinning && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
      {status}
    </span>
  );
}

// ── Phase stepper ──

const PHASES = [
  { key: 'proposing', label: 'Propose' },
  { key: 'debate_1', label: 'Debate 1' },
  { key: 'debate_2', label: 'Debate 2' },
  { key: 'voting', label: 'Vote' },
  { key: 'decided', label: 'Decision' },
  { key: 'implementing', label: 'Implement' },
];

function phaseIndex(status: string, debateRounds: number): number {
  if (status === 'proposing') return 0;
  if (status === 'debating' && debateRounds <= 1) return 1;
  if (status === 'debating' && debateRounds >= 2) return 2;
  if (status === 'voting') return 3;
  if (status === 'decided') return 4;
  if (status === 'implementing') return 5;
  return 0;
}

function PhaseStepper({ status, debateRounds }: { status: string; debateRounds: number }) {
  const current = phaseIndex(status, debateRounds);
  const terminal = status === 'decided' || status === 'implementing';
  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase, i) => {
        const isDone = i < current || (terminal && i <= current);
        const isActive = i === current && !terminal && status !== 'failed';
        const cls = isDone
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
          : isActive
          ? 'bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse'
          : phase.key === 'implementing' && status === 'implementing'
          ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 animate-pulse'
          : 'bg-zinc-800 text-zinc-500 border-zinc-700';
        return (
          <span key={phase.key} className={`px-2 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
            {phase.label}
          </span>
        );
      })}
    </div>
  );
}

// ── Collapsible section ──

function Section({ title, defaultOpen, children, count }: { title: string; defaultOpen?: boolean; children: React.ReactNode; count?: number }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div className="border border-zinc-800 rounded-lg">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800/50 transition rounded-lg"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
        {count !== undefined && (
          <span className="ml-auto text-[10px] text-zinc-500">{count}</span>
        )}
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  );
}

// ── Simple markdown renderer ──

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-xs font-semibold text-white mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-purple-400 mt-4 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-sm font-bold text-white mt-4 mb-1">{line.slice(2)}</h2>);
    }
    // Code blocks
    else if (line.startsWith('```')) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <div key={`code-${i}`} className="my-2">
          {lang && <span className="text-[10px] text-emerald-500 font-mono">{lang}</span>}
          <pre className="bg-zinc-950 border border-zinc-800 rounded p-2 text-[11px] text-emerald-300 font-mono overflow-x-auto whitespace-pre-wrap">
            {codeLines.join('\n')}
          </pre>
        </div>
      );
    }
    // Horizontal rule
    else if (line.match(/^---+$/)) {
      elements.push(<hr key={i} className="border-zinc-800 my-3" />);
    }
    // List items
    else if (line.match(/^[-*]\s+/)) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-zinc-300 ml-2">
          <span className="text-zinc-500 mt-0.5">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^[-*]\s+/, '')) }} />
        </div>
      );
    }
    // Numbered list
    else if (line.match(/^\d+\.\s+/)) {
      const num = line.match(/^(\d+)\./)?.[1];
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-zinc-300 ml-2">
          <span className="text-zinc-500 mt-0.5 font-mono text-[10px]">{num}.</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^\d+\.\s+/, '')) }} />
        </div>
      );
    }
    // Empty line
    else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
    }
    // Regular paragraph
    else {
      elements.push(
        <p key={i} className="text-xs text-zinc-300" dangerouslySetInnerHTML={{ __html: inlineFormat(line) }} />
      );
    }
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em class="text-zinc-300">$1</em>')
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 bg-zinc-800 rounded text-amber-400 text-[10px] font-mono">$1</code>');
}

// ── Main component ──

interface DeliberationPanelProps {
  deliberationId: string;
  onClose?: () => void;
  onComplete?: () => void;
}

export default function DeliberationPanel({ deliberationId, onClose, onComplete }: DeliberationPanelProps) {
  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [issueResult, setIssueResult] = useState<{ message: string; created: number; skipped: number } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cockpit/deliberation/${deliberationId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.status === 'decided' && onComplete) onComplete();
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [deliberationId, onComplete]);

  // Poll every 5s while active
  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (data && !['decided', 'failed'].includes(data.status)) {
        fetchData();
      }
    }, data?.status === 'implementing' ? 10000 : 5000);
    return () => clearInterval(interval);
  }, [fetchData, data?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const runAction = async (action: 'advance' | 'auto' | 'delete' | 'create-issues') => {
    setActionLoading(action);
    try {
      if (action === 'delete') {
        await fetch(`/api/admin/cockpit/deliberation/${deliberationId}`, { method: 'DELETE' });
        onClose?.();
        return;
      }
      if (action === 'create-issues') {
        const res = await fetch(`/api/admin/cockpit/deliberation/${deliberationId}/create-issues`, { method: 'POST' });
        if (res.ok) {
          const result = await res.json();
          setIssueResult({
            message: result.message,
            created: result.created?.length || 0,
            skipped: result.skipped?.length || 0,
          });
        } else {
          const err = await res.json().catch(() => ({ error: 'Failed' }));
          setIssueResult({ message: err.error || 'Failed to create issues', created: 0, skipped: 0 });
        }
        return;
      }
      await fetch(`/api/admin/cockpit/deliberation/${deliberationId}/${action}`, { method: 'POST' });
      // Re-fetch immediately
      setTimeout(fetchData, 1000);
    } catch { /* ignore */ }
    finally { setActionLoading(null); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-zinc-500 text-xs">
        Deliberation not found
      </div>
    );
  }

  const debateRounds = data.debates.length > 0 ? Math.max(...data.debates.map(d => d.round)) : 0;

  // Vote tally
  const voteCounts = new Map<string, number>();
  for (const v of data.votes) {
    voteCounts.set(v.votedFor, (voteCounts.get(v.votedFor) || 0) + 1);
  }
  const winner = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  const isActive = !['decided', 'implementing', 'failed'].includes(data.status);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-white">
              {data.type === 'architecture_review' ? '🔍 Architecture Review' : '🤖 Deliberation'}
            </span>
            <StatusBadge status={data.status} />
          </div>
          {data.title && <p className="text-xs text-zinc-400">{data.title}</p>}
          <PhaseStepper status={data.status} debateRounds={debateRounds} />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-zinc-500">{formatTimeAgo(data.createdAt)}</span>
          {onClose && (
            <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Create Issues — prominent at top for decided architecture reviews */}
      {(data.status === 'decided' || data.status === 'implementing') && data.type === 'architecture_review' && (
        <div className="flex items-center gap-2">
          {!issueResult ? (
            <button
              onClick={() => runAction('create-issues')}
              disabled={actionLoading !== null}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-500/20 border border-blue-500/30 rounded-lg text-sm font-medium text-blue-400 hover:bg-blue-500/30 transition disabled:opacity-50"
            >
              {actionLoading === 'create-issues' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
              Create GitHub Issues from Findings
            </button>
          ) : (
            <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs flex-1 ${issueResult.created > 0 ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'}`}>
              <ExternalLink className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{issueResult.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {data.status === 'failed' && data.error && (
        <div className="flex items-start gap-2 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{data.error}</span>
        </div>
      )}

      {/* Management Summary — prominent at top */}
      {data.managementSummary && (
        <div className="bg-purple-500/5 border border-purple-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold text-purple-400">Executive Summary</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-500/20 text-purple-300 border border-purple-500/30">
              TL;DR
            </span>
          </div>
          <MarkdownContent text={data.managementSummary} />
        </div>
      )}

      {/* Proposals */}
      {data.proposals.length > 0 && (
        <Section title={`Proposals (${data.proposals.length})`} defaultOpen count={data.proposals.length}>
          {data.proposals.map(p => {
            const style = agentStyle(p.agentName);
            const hasStructured = p.strengths || p.risks || p.effort;
            return (
              <div key={p.id} className={`${style.bg} border ${style.border} rounded-lg p-3`}>
                <div className="flex items-center gap-2 mb-2">
                  <span>{AGENT_ICONS[p.agentName] || '🤖'}</span>
                  <span className={`text-xs font-semibold ${style.text}`}>{p.agentName}</span>
                  <span className="text-[10px] text-zinc-500 font-mono">{p.agentModel}</span>
                  {p.effort && (
                    <span className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700">
                      {p.effort}
                    </span>
                  )}
                </div>
                <MarkdownContent text={p.content} />
                {hasStructured && (
                  <div className="mt-3 pt-2 border-t border-zinc-700/50 grid grid-cols-2 gap-2">
                    {p.strengths && (
                      <div>
                        <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Strengths</span>
                        <p className="text-[11px] text-zinc-300 mt-0.5">{p.strengths}</p>
                      </div>
                    )}
                    {p.risks && (
                      <div>
                        <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wider">Risks</span>
                        <p className="text-[11px] text-zinc-300 mt-0.5">{p.risks}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {/* Debate */}
      {data.debates.length > 0 && (
        <Section title={`Debate (${debateRounds} round${debateRounds > 1 ? 's' : ''})`} defaultOpen={data.status === 'debating'} count={data.debates.length}>
          {[1, 2].map(round => {
            const roundDebates = data.debates.filter(d => d.round === round);
            if (roundDebates.length === 0) return null;
            return (
              <div key={round}>
                <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Round {round}</h4>
                <div className="space-y-2">
                  {roundDebates.map(d => {
                    const style = agentStyle(d.agentName);
                    return (
                      <div key={d.id} className={`${style.bg} border ${style.border} rounded-lg p-3`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span>{AGENT_ICONS[d.agentName] || '🤖'}</span>
                          <span className={`text-xs font-semibold ${style.text}`}>{d.agentName}</span>
                        </div>
                        <MarkdownContent text={d.content} />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Votes */}
      {data.votes.length > 0 && (
        <Section title="Votes" defaultOpen={data.status === 'decided'} count={data.votes.length}>
          <div className="space-y-2">
            {data.votes.map(v => {
              const style = agentStyle(v.agentName);
              const votedStyle = agentStyle(v.votedFor);
              const isWinner = v.votedFor === winner;
              return (
                <div key={v.id} className="flex items-start gap-3 text-xs">
                  <div className="flex items-center gap-1.5 min-w-[120px]">
                    <span>{AGENT_ICONS[v.agentName] || '🤖'}</span>
                    <span className={style.text}>{v.agentName}</span>
                  </div>
                  <span className="text-zinc-500">→</span>
                  <div className="flex-1">
                    <span className={`${votedStyle.text} font-semibold`}>
                      {AGENT_ICONS[v.votedFor] || ''} {v.votedFor}
                      {isWinner && ' 🏆'}
                    </span>
                    <p className="text-zinc-400 mt-0.5">{v.reasoning}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {winner && (
            <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs text-emerald-400">
              Winner: <strong>{winner}</strong> ({voteCounts.get(winner)} vote{(voteCounts.get(winner) || 0) > 1 ? 's' : ''})
            </div>
          )}
        </Section>
      )}

      {/* Synthesis / Decision */}
      {data.summary && (
        <Section title="Decision" defaultOpen count={undefined}>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
            <MarkdownContent text={data.summary} />
          </div>
        </Section>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
        {isActive && data.status !== 'proposing' && (
          <button
            onClick={() => runAction('advance')}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition disabled:opacity-50"
          >
            {actionLoading === 'advance' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Advance
          </button>
        )}
        {isActive && (
          <button
            onClick={() => runAction('auto')}
            disabled={actionLoading !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-lg text-xs text-purple-400 hover:bg-purple-500/30 transition disabled:opacity-50"
          >
            {actionLoading === 'auto' ? <Loader2 className="w-3 h-3 animate-spin" /> : <FastForward className="w-3 h-3" />}
            Auto-Run All
          </button>
        )}
        <button
          onClick={() => runAction('delete')}
          disabled={actionLoading !== null}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition disabled:opacity-50 ml-auto"
        >
          <Trash2 className="w-3 h-3" />
          Delete
        </button>
      </div>
    </div>
  );
}
