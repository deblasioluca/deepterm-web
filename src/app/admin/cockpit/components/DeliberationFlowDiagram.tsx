'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, X, FileText, MessageSquare, Vote, CheckCircle2, Brain, Eye } from 'lucide-react';
import type { DeliberationDetail } from '../types';

// ── Agent colors ──

const AGENT_COLORS: Record<string, { bg: string; text: string; border: string; line: string }> = {
  Architect:              { bg: 'bg-blue-500/15', text: 'text-blue-400', border: 'border-blue-500/40', line: '#3b82f6' },
  'Security Engineer':    { bg: 'bg-red-500/15', text: 'text-red-400', border: 'border-red-500/40', line: '#ef4444' },
  Pragmatist:             { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/40', line: '#f59e0b' },
  'Performance Engineer': { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/40', line: '#10b981' },
};

const AGENT_ICONS: Record<string, string> = {
  Architect: '🏗️',
  'Security Engineer': '🔒',
  Pragmatist: '⚡',
  'Performance Engineer': '🚀',
};

function agentColor(name: string) {
  return AGENT_COLORS[name] || { bg: 'bg-zinc-500/15', text: 'text-zinc-400', border: 'border-zinc-500/40', line: '#71717a' };
}

// ── Simple Markdown renderer ──

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="text-xs font-semibold text-white mt-3 mb-1">{line.slice(4)}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="text-sm font-semibold text-purple-400 mt-4 mb-1">{line.slice(3)}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="text-sm font-bold text-white mt-4 mb-1">{line.slice(2)}</h2>);
    } else if (line.startsWith('```')) {
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
    } else if (line.match(/^[-*]\s+/)) {
      elements.push(
        <div key={i} className="flex gap-1.5 text-xs text-zinc-300 ml-2">
          <span className="text-zinc-500 mt-0.5">•</span>
          <span dangerouslySetInnerHTML={{ __html: inlineFormat(line.replace(/^[-*]\s+/, '')) }} />
        </div>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-1" />);
    } else {
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

// ── Phase node ──

function PhaseNode({ label, icon, status, onClick }: {
  label: string;
  icon: React.ReactNode;
  status: 'done' | 'active' | 'pending';
  onClick?: () => void;
}) {
  const styles = {
    done: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    active: 'bg-amber-500/15 border-amber-500/40 text-amber-400 animate-pulse',
    pending: 'bg-zinc-800/60 border-zinc-700 text-zinc-500',
  };

  return (
    <button
      onClick={onClick}
      disabled={status === 'pending' || !onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${styles[status]} ${onClick && status !== 'pending' ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'}`}
      title={onClick && status !== 'pending' ? `View ${label} protocol` : undefined}
    >
      {icon}
      {label}
      {onClick && status !== 'pending' && <Eye className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
    </button>
  );
}

// ── Agent lane ──

function AgentLane({ name, status, onClick }: {
  name: string;
  status: 'done' | 'active' | 'pending';
  onClick?: () => void;
}) {
  const color = agentColor(name);
  const styles = {
    done: `${color.bg} ${color.border} ${color.text}`,
    active: `${color.bg} ${color.border} ${color.text} animate-pulse`,
    pending: 'bg-zinc-800/40 border-zinc-700 text-zinc-600',
  };

  return (
    <button
      onClick={onClick}
      disabled={status === 'pending' || !onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition ${styles[status]} ${onClick && status !== 'pending' ? 'hover:brightness-125 cursor-pointer' : 'cursor-default'}`}
      title={onClick && status !== 'pending' ? `View ${name} protocol` : undefined}
    >
      <span>{AGENT_ICONS[name] || '🤖'}</span>
      <span className="truncate max-w-[100px]">{name}</span>
      {onClick && status !== 'pending' && <Eye className="w-2.5 h-2.5 ml-auto opacity-60" />}
    </button>
  );
}

// ── Flow connector ──

function FlowConnector({ branching }: { branching?: boolean }) {
  return (
    <div className="flex justify-center py-1">
      <div className={`w-px h-4 ${branching ? 'bg-gradient-to-b from-zinc-600 to-transparent' : 'bg-zinc-700'}`} />
    </div>
  );
}

function ForkLine({ count }: { count: number }) {
  return (
    <div className="relative flex justify-center py-0.5">
      <svg className="w-full h-5" viewBox={`0 0 ${Math.max(count * 120, 200)} 20`} preserveAspectRatio="xMidYMid meet">
        <line x1="50%" y1="0" x2="50%" y2="10" stroke="#52525b" strokeWidth="1.5" />
        {Array.from({ length: count }).map((_, i) => {
          const x = count === 1 ? 50 : (i / (count - 1)) * 80 + 10;
          return (
            <line key={i} x1="50%" y1="10" x2={`${x}%`} y2="20" stroke="#52525b" strokeWidth="1" />
          );
        })}
      </svg>
    </div>
  );
}

function MergeLine({ count }: { count: number }) {
  return (
    <div className="relative flex justify-center py-0.5">
      <svg className="w-full h-5" viewBox={`0 0 ${Math.max(count * 120, 200)} 20`} preserveAspectRatio="xMidYMid meet">
        {Array.from({ length: count }).map((_, i) => {
          const x = count === 1 ? 50 : (i / (count - 1)) * 80 + 10;
          return (
            <line key={i} x1={`${x}%`} y1="0" x2="50%" y2="10" stroke="#52525b" strokeWidth="1" />
          );
        })}
        <line x1="50%" y1="10" x2="50%" y2="20" stroke="#52525b" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ── Overlay Panel ──

function ProtocolOverlay({ title, children, onClose }: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[90vw] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="p-1 text-zinc-500 hover:text-zinc-300 transition">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Main component ──

interface DeliberationFlowDiagramProps {
  deliberationId: string;
}

export default function DeliberationFlowDiagram({ deliberationId }: DeliberationFlowDiagramProps) {
  const [data, setData] = useState<DeliberationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [overlay, setOverlay] = useState<{ title: string; content: React.ReactNode } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/cockpit/deliberation/${deliberationId}`);
      if (res.ok) setData(await res.json());
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [deliberationId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (data && !['decided', 'failed'].includes(data.status)) fetchData();
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchData, data?.status]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-xs text-zinc-600 text-center py-4">No deliberation data</div>;
  }

  // Determine phase statuses
  const status = data.status;
  const debateRounds = data.debates.length > 0 ? Math.max(...data.debates.map(d => d.round)) : 0;

  type PhaseStatus = 'done' | 'active' | 'pending';
  const proposeStatus: PhaseStatus = status === 'proposing' ? 'active' : data.proposals.length > 0 ? 'done' : 'pending';
  
  const debateStatus: PhaseStatus = status === 'debating' ? 'active' : 
    ['voting', 'decided', 'implementing'].includes(status) ? 'done' : 'pending';

  const voteStatus: PhaseStatus = status === 'voting' ? 'active' :
    ['decided', 'implementing'].includes(status) ? 'done' : 'pending';

  const decisionStatus: PhaseStatus = ['decided', 'implementing'].includes(status) ? 'done' : 'pending';

  // Agent names from proposals
  const agentNames = data.proposals.map(p => p.agentName);
  const uniqueAgents = Array.from(new Set(agentNames));

  // Vote tally
  const voteCounts = new Map<string, number>();
  for (const v of data.votes) {
    voteCounts.set(v.votedFor, (voteCounts.get(v.votedFor) || 0) + 1);
  }
  const winner = Array.from(voteCounts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];

  // Overlay handlers
  const openProposal = (agentName: string) => {
    const proposal = data.proposals.find(p => p.agentName === agentName);
    if (!proposal) return;
    const color = agentColor(agentName);
    setOverlay({
      title: `${AGENT_ICONS[agentName] || '🤖'} ${agentName} — Proposal`,
      content: (
        <div className={`${color.bg} border ${color.border} rounded-lg p-4`}>
          <MarkdownContent text={proposal.content} />
          {(proposal.strengths || proposal.risks || proposal.effort) && (
            <div className="mt-3 pt-3 border-t border-zinc-700/50 grid grid-cols-2 gap-3">
              {proposal.strengths && (
                <div>
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Strengths</span>
                  <p className="text-xs text-zinc-300 mt-1">{proposal.strengths}</p>
                </div>
              )}
              {proposal.risks && (
                <div>
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Risks</span>
                  <p className="text-xs text-zinc-300 mt-1">{proposal.risks}</p>
                </div>
              )}
              {proposal.effort && (
                <div>
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Effort</span>
                  <p className="text-xs text-zinc-300 mt-1">{proposal.effort}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ),
    });
  };

  const openDebate = (agentName: string, round: number) => {
    const debate = data.debates.find(d => d.agentName === agentName && d.round === round);
    if (!debate) return;
    const color = agentColor(agentName);
    setOverlay({
      title: `${AGENT_ICONS[agentName] || '🤖'} ${agentName} — Debate Round ${round}`,
      content: (
        <div className={`${color.bg} border ${color.border} rounded-lg p-4`}>
          <MarkdownContent text={debate.content} />
        </div>
      ),
    });
  };

  const openVotes = () => {
    setOverlay({
      title: '🗳️ Votes',
      content: (
        <div className="space-y-3">
          {data.votes.map((v) => {
            const style = agentColor(v.agentName);
            const votedStyle = agentColor(v.votedFor);
            const isWinner = v.votedFor === winner;
            return (
              <div key={v.id} className={`${style.bg} border ${style.border} rounded-lg p-3`}>
                <div className="flex items-center gap-2 mb-1">
                  <span>{AGENT_ICONS[v.agentName] || '🤖'}</span>
                  <span className={`text-xs font-semibold ${style.text}`}>{v.agentName}</span>
                  <span className="text-zinc-500 text-xs">voted for</span>
                  <span className={`text-xs font-semibold ${votedStyle.text}`}>
                    {AGENT_ICONS[v.votedFor] || ''} {v.votedFor} {isWinner ? '🏆' : ''}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">{v.reasoning}</p>
              </div>
            );
          })}
          {winner && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400">
              Winner: <strong>{winner}</strong> ({voteCounts.get(winner)} vote{(voteCounts.get(winner) || 0) > 1 ? 's' : ''})
            </div>
          )}
        </div>
      ),
    });
  };

  const openDecision = () => {
    setOverlay({
      title: '✅ Decision',
      content: (
        <div className="space-y-4">
          {data.managementSummary && (
            <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-purple-400">Executive Summary</span>
              </div>
              <MarkdownContent text={data.managementSummary} />
            </div>
          )}
          {data.summary && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <MarkdownContent text={data.summary} />
            </div>
          )}
        </div>
      ),
    });
  };

  // Get debate rounds as arrays of agent names
  const round1Agents = Array.from(new Set(data.debates.filter(d => d.round === 1).map(d => d.agentName)));
  const round2Agents = Array.from(new Set(data.debates.filter(d => d.round === 2).map(d => d.agentName)));

  return (
    <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/50 p-4">
      <h5 className="text-[11px] font-medium text-zinc-400 mb-3 flex items-center gap-1.5">
        <Brain className="w-3.5 h-3.5 text-purple-400" />
        Deliberation Flow
        <span className="ml-auto text-[10px] text-zinc-600">{status}</span>
      </h5>

      <div className="flex flex-col items-center">
        {/* Start */}
        <div className="px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] text-zinc-400 font-medium">
          Start
        </div>

        <FlowConnector />

        {/* Propose Phase */}
        <PhaseNode
          label="Propose"
          icon={<FileText className="w-3 h-3" />}
          status={proposeStatus}
          onClick={undefined}
        />

        {/* Fork to individual agent proposals */}
        {uniqueAgents.length > 0 && (
          <>
            <ForkLine count={uniqueAgents.length} />
            <div className="flex gap-2 flex-wrap justify-center">
              {uniqueAgents.map((name) => (
                <AgentLane
                  key={name}
                  name={name}
                  status={proposeStatus}
                  onClick={proposeStatus !== 'pending' ? () => openProposal(name) : undefined}
                />
              ))}
            </div>
            <MergeLine count={uniqueAgents.length} />
          </>
        )}

        {uniqueAgents.length === 0 && <FlowConnector />}

        {/* Debate Phase — Round 1 */}
        <PhaseNode
          label={debateRounds > 1 ? 'Debate Round 1' : 'Debate'}
          icon={<MessageSquare className="w-3 h-3" />}
          status={debateStatus}
          onClick={undefined}
        />

        {round1Agents.length > 0 && (
          <>
            <ForkLine count={round1Agents.length} />
            <div className="flex gap-2 flex-wrap justify-center">
              {round1Agents.map((name) => (
                <AgentLane
                  key={name}
                  name={name}
                  status={debateStatus}
                  onClick={() => openDebate(name, 1)}
                />
              ))}
            </div>
            <MergeLine count={round1Agents.length} />
          </>
        )}

        {round1Agents.length === 0 && <FlowConnector />}

        {/* Debate Round 2 (optional) */}
        {(debateRounds >= 2 || round2Agents.length > 0) && (
          <>
            <PhaseNode
              label="Debate Round 2"
              icon={<MessageSquare className="w-3 h-3" />}
              status={debateStatus}
              onClick={undefined}
            />
            {round2Agents.length > 0 && (
              <>
                <ForkLine count={round2Agents.length} />
                <div className="flex gap-2 flex-wrap justify-center">
                  {round2Agents.map((name) => (
                    <AgentLane
                      key={name}
                      name={name}
                      status={debateStatus}
                      onClick={() => openDebate(name, 2)}
                    />
                  ))}
                </div>
                <MergeLine count={round2Agents.length} />
              </>
            )}
          </>
        )}

        {/* Vote */}
        <PhaseNode
          label="Vote"
          icon={<Vote className="w-3 h-3" />}
          status={voteStatus}
          onClick={data.votes.length > 0 ? openVotes : undefined}
        />

        <FlowConnector />

        {/* Decision */}
        <PhaseNode
          label="Decision"
          icon={<CheckCircle2 className="w-3 h-3" />}
          status={decisionStatus}
          onClick={data.summary ? openDecision : undefined}
        />

        {/* Winner badge */}
        {winner && decisionStatus === 'done' && (
          <>
            <FlowConnector />
            <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-medium flex items-center gap-1.5">
              🏆 {AGENT_ICONS[winner] || ''} {winner}
            </div>
          </>
        )}
      </div>

      {/* Overlay */}
      {overlay && (
        <ProtocolOverlay title={overlay.title} onClose={() => setOverlay(null)}>
          {overlay.content}
        </ProtocolOverlay>
      )}
    </div>
  );
}
