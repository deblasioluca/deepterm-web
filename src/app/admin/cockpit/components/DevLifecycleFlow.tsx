'use client';

import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  AlertTriangle,
  User,
  Bot,
  Play,
  SkipForward,
  ExternalLink,
  GitPullRequest,
  TestTube,
  Rocket,
  FileText,
  MessageSquare,
  Zap,
  Brain,
  Vote,
  Shield,
  Mail,
  BookOpen,
  ArrowRight,
} from 'lucide-react';

// ── Types ──

type StepStatus = 'pending' | 'active' | 'passed' | 'failed' | 'skipped' | 'waiting_approval';
type Actor = 'human' | 'ai' | 'system';

interface GateAction {
  label: string;
  action: string;
  variant: 'approve' | 'reject' | 'skip';
}

interface LifecycleStep {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  actor: Actor;
  status: StepStatus;
  detail?: string;
  link?: { url: string; label: string };
  gate?: {
    required: boolean;
    actions: GateAction[];
  };
  substeps?: { label: string; status: StepStatus }[];
  timestamp?: string;
}

// ── Status styles ──

const STATUS_CONFIG: Record<StepStatus, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
  pending:           { bg: 'bg-zinc-800/50', border: 'border-zinc-700', text: 'text-zinc-500', icon: <Clock className="w-4 h-4 text-zinc-500" /> },
  active:            { bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-400', icon: <Loader2 className="w-4 h-4 text-blue-400 animate-spin" /> },
  passed:            { bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: <CheckCircle2 className="w-4 h-4 text-emerald-400" /> },
  failed:            { bg: 'bg-red-500/10', border: 'border-red-500/40', text: 'text-red-400', icon: <XCircle className="w-4 h-4 text-red-400" /> },
  skipped:           { bg: 'bg-zinc-800/30', border: 'border-zinc-700/50', text: 'text-zinc-600', icon: <SkipForward className="w-4 h-4 text-zinc-600" /> },
  waiting_approval:  { bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-400', icon: <AlertTriangle className="w-4 h-4 text-amber-400" /> },
};

const ACTOR_BADGE: Record<Actor, { label: string; style: string; icon: React.ReactNode }> = {
  human:  { label: 'You', style: 'bg-purple-500/20 text-purple-400 border-purple-500/30', icon: <User className="w-3 h-3" /> },
  ai:     { label: 'AI', style: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30', icon: <Bot className="w-3 h-3" /> },
  system: { label: 'System', style: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30', icon: <Zap className="w-3 h-3" /> },
};

// ── Connector arrow between steps ──

function StepConnector({ fromStatus, toStatus }: { fromStatus: StepStatus; toStatus: StepStatus }) {
  const color = fromStatus === 'passed' ? 'text-emerald-500' : fromStatus === 'failed' ? 'text-red-500' : 'text-zinc-700';
  return (
    <div className="flex items-center justify-center py-1">
      <div className={`flex flex-col items-center ${color}`}>
        <div className={`w-0.5 h-4 ${fromStatus === 'passed' ? 'bg-emerald-500' : fromStatus === 'failed' ? 'bg-red-500' : 'bg-zinc-700'}`} />
        <ArrowRight className="w-3 h-3 rotate-90" />
      </div>
    </div>
  );
}

// ── Gate buttons ──

function GateButtons({ gate, stepId, onGateAction }: {
  gate: NonNullable<LifecycleStep['gate']>;
  stepId: string;
  onGateAction: (stepId: string, action: string) => void;
}) {
  const variants: Record<string, string> = {
    approve: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    reject: 'bg-red-600 hover:bg-red-500 text-white',
    skip: 'bg-zinc-600 hover:bg-zinc-500 text-zinc-200',
  };

  return (
    <div className="flex gap-2 mt-2">
      {gate.actions.map((a) => (
        <button
          key={a.action}
          onClick={() => onGateAction(stepId, a.action)}
          className={`px-3 py-1 rounded text-xs font-medium transition ${variants[a.variant] || variants.skip}`}
        >
          {a.variant === 'approve' && <CheckCircle2 className="w-3 h-3 inline mr-1" />}
          {a.variant === 'reject' && <XCircle className="w-3 h-3 inline mr-1" />}
          {a.variant === 'skip' && <SkipForward className="w-3 h-3 inline mr-1" />}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Single step card ──

function StepCard({ step, isLast, onGateAction }: {
  step: LifecycleStep;
  isLast: boolean;
  onGateAction: (stepId: string, action: string) => void;
}) {
  const cfg = STATUS_CONFIG[step.status];
  const actor = ACTOR_BADGE[step.actor];
  const isGate = step.status === 'waiting_approval' && step.gate;

  return (
    <div className={`relative rounded-lg border p-3 transition-all ${cfg.bg} ${cfg.border} ${step.status === 'active' || step.status === 'waiting_approval' ? 'ring-1 ring-offset-0' : ''} ${step.status === 'active' ? 'ring-blue-500/30' : step.status === 'waiting_approval' ? 'ring-amber-500/30' : ''}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`flex-shrink-0 mt-0.5 p-1.5 rounded-md ${cfg.bg} border ${cfg.border}`}>
          {step.icon}
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-medium text-sm ${cfg.text}`}>{step.label}</span>
            {cfg.icon}
            {/* Actor badge */}
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${actor.style}`}>
              {actor.icon} {actor.label}
            </span>
            {/* Status text */}
            <span className={`text-[10px] ${cfg.text}`}>
              {step.status === 'waiting_approval' ? 'Needs approval' : step.status}
            </span>
          </div>
          
          <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
          
          {/* Detail text */}
          {step.detail && (
            <p className={`text-xs mt-1 ${step.status === 'failed' ? 'text-red-400' : 'text-zinc-400'}`}>
              {step.detail}
            </p>
          )}

          {/* Substeps */}
          {step.substeps && step.substeps.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {step.substeps.map((sub, i) => {
                const subCfg = STATUS_CONFIG[sub.status];
                return (
                  <span key={i} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border ${subCfg.bg} ${subCfg.border} ${subCfg.text}`}>
                    {subCfg.icon} {sub.label}
                  </span>
                );
              })}
            </div>
          )}

          {/* Link */}
          {step.link && (
            <a href={step.link.url} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-1">
              <ExternalLink className="w-3 h-3" /> {step.link.label}
            </a>
          )}

          {/* Gate actions */}
          {isGate && step.gate && (
            <GateButtons gate={step.gate} stepId={step.id} onGateAction={onGateAction} />
          )}

          {/* Timestamp */}
          {step.timestamp && (
            <p className="text-[10px] text-zinc-600 mt-1">{step.timestamp}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Build lifecycle steps from story data ──

function buildLifecycleSteps(story: StoryLifecycleData | null): LifecycleStep[] {
  if (!story) return getDefaultSteps();

  const s = story;
  const steps: LifecycleStep[] = [];

  // 1. Triage
  const triageStatus: StepStatus = s.triageApproved === true ? 'passed' : s.triageApproved === false ? 'failed' : s.status === 'backlog' ? 'waiting_approval' : 'passed';
  steps.push({
    id: 'triage', label: 'Triage', description: 'Issue or idea reviewed and approved',
    icon: <Zap className="w-4 h-4" />, actor: 'human', status: triageStatus,
    detail: triageStatus === 'waiting_approval' ? 'Awaiting your approval in Triage queue' : undefined,
    gate: triageStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Approve', action: 'approve-triage', variant: 'approve' },
        { label: 'Reject', action: 'reject-triage', variant: 'reject' },
        { label: 'Defer', action: 'defer-triage', variant: 'skip' },
      ],
    } : undefined,
  });

  // 2. Planning
  const planStatus: StepStatus = s.epicId ? 'passed' : triageStatus === 'passed' ? 'active' : 'pending';
  steps.push({
    id: 'planning', label: 'Plan', description: 'Create epic & stories, set priority',
    icon: <FileText className="w-4 h-4" />, actor: 'human', status: planStatus,
    detail: s.epicId ? `Epic: ${s.epicTitle || s.epicId}` : undefined,
  });

  // 3. AI Deliberation
  const delibPhase = s.deliberationStatus;
  let delibStatus: StepStatus = 'pending';
  if (delibPhase === 'decided') delibStatus = 'passed';
  else if (delibPhase === 'failed') delibStatus = 'failed';
  else if (delibPhase && delibPhase !== 'none') delibStatus = 'active';
  else if (planStatus === 'passed') delibStatus = 'waiting_approval';

  const delibSubsteps = [
    { label: 'Propose', status: getSubstepStatus(delibPhase, ['proposing', 'debating', 'voting', 'decided', 'implementing']) },
    { label: 'Debate', status: getSubstepStatus(delibPhase, ['debating', 'voting', 'decided', 'implementing']) },
    { label: 'Vote', status: getSubstepStatus(delibPhase, ['voting', 'decided', 'implementing']) },
    { label: 'Decide', status: getSubstepStatus(delibPhase, ['decided', 'implementing']) },
  ];

  steps.push({
    id: 'deliberation', label: 'AI Deliberation', description: '4 AI agents propose, debate, vote on architecture',
    icon: <Brain className="w-4 h-4" />, actor: 'ai', status: delibStatus,
    substeps: delibPhase && delibPhase !== 'none' ? delibSubsteps : undefined,
    detail: delibPhase === 'decided' ? 'Architecture decided' : delibPhase && delibPhase !== 'none' ? `Phase: ${delibPhase}` : undefined,
    gate: delibStatus === 'waiting_approval' ? {
      required: false,
      actions: [
        { label: 'Start Deliberation', action: 'start-deliberation', variant: 'approve' },
        { label: 'Skip', action: 'skip-deliberation', variant: 'skip' },
      ],
    } : delibStatus === 'passed' ? {
      required: true,
      actions: [
        { label: 'Review & Approve Decision', action: 'approve-decision', variant: 'approve' },
        { label: 'Re-debate', action: 'restart-deliberation', variant: 'skip' },
      ],
    } : undefined,
  });

  // 4. Implementation (Agent Loop → PR)
  const implStatus: StepStatus = s.prNumber ? 'passed' : s.agentLoopStatus === 'running' ? 'active' : s.agentLoopStatus === 'failed' ? 'failed' : delibStatus === 'passed' ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'implement', label: 'Implement', description: 'AI agent writes code and creates PR',
    icon: <GitPullRequest className="w-4 h-4" />, actor: 'ai', status: implStatus,
    detail: s.prNumber ? `PR #${s.prNumber}` : s.agentLoopStatus === 'running' ? 'Agent coding...' : s.agentLoopStatus === 'failed' ? 'Agent failed — fix & retry' : undefined,
    link: s.prUrl ? { url: s.prUrl, label: `PR #${s.prNumber}` } : undefined,
    gate: implStatus === 'waiting_approval' ? {
      required: false,
      actions: [
        { label: 'Start Agent', action: 'start-agent', variant: 'approve' },
        { label: 'Manual PR', action: 'manual-pr', variant: 'skip' },
      ],
    } : implStatus === 'failed' ? {
      required: false,
      actions: [
        { label: 'Retry Agent', action: 'retry-agent', variant: 'approve' },
        { label: 'Manual Fix', action: 'manual-fix', variant: 'skip' },
      ],
    } : undefined,
  });

  // 5. Review PR
  const reviewStatus: StepStatus = s.prMerged ? 'passed' : s.prNumber ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'review', label: 'Review PR', description: 'Review diff, approve or request changes',
    icon: <MessageSquare className="w-4 h-4" />, actor: 'human', status: reviewStatus,
    link: s.prUrl ? { url: s.prUrl, label: 'View in Pull Requests tab' } : undefined,
    gate: reviewStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Approve & Merge', action: 'merge-pr', variant: 'approve' },
        { label: 'Request Changes', action: 'request-changes', variant: 'reject' },
      ],
    } : undefined,
  });

  // 6. Test
  const testStatus: StepStatus = s.testsPass === true ? 'passed' : s.testsPass === false ? 'failed' : s.prMerged ? 'active' : 'pending';
  steps.push({
    id: 'test', label: 'Test', description: 'Playwright E2E + unit tests + UI tests',
    icon: <TestTube className="w-4 h-4" />, actor: 'system', status: testStatus,
    substeps: s.prMerged ? [
      { label: 'E2E (Playwright)', status: s.e2ePass ?? 'pending' as StepStatus },
      { label: 'Unit Tests', status: s.unitPass ?? 'pending' as StepStatus },
      { label: 'UI Tests', status: s.uiPass ?? 'pending' as StepStatus },
    ] : undefined,
    detail: testStatus === 'failed' ? 'Tests failed — fix required before deploy' : undefined,
    gate: testStatus === 'failed' ? {
      required: false,
      actions: [
        { label: 'Back to Implement', action: 'back-to-implement', variant: 'reject' },
        { label: 'Force Continue', action: 'force-continue', variant: 'skip' },
      ],
    } : undefined,
  });

  // 7. Deploy
  const deployStatus: StepStatus = s.deployed ? 'passed' : testStatus === 'passed' ? 'waiting_approval' : 'pending';
  steps.push({
    id: 'deploy', label: 'Deploy', description: 'Build, sign, notarize, deploy to production',
    icon: <Rocket className="w-4 h-4" />, actor: 'system', status: deployStatus,
    detail: s.deployed ? `v${s.version || '?'}` : undefined,
    gate: deployStatus === 'waiting_approval' ? {
      required: true,
      actions: [
        { label: 'Deploy Release', action: 'deploy-release', variant: 'approve' },
        { label: 'Hold', action: 'hold-deploy', variant: 'skip' },
      ],
    } : undefined,
  });

  // 8. Release
  const releaseStatus: StepStatus = s.released ? 'passed' : s.deployed ? 'active' : 'pending';
  steps.push({
    id: 'release', label: 'Release', description: 'Release notes, email users, update docs',
    icon: <Mail className="w-4 h-4" />, actor: 'system', status: releaseStatus,
    substeps: s.deployed ? [
      { label: 'Release Notes', status: s.releaseNotesDone ? 'passed' : 'active' as StepStatus },
      { label: 'Email Users', status: s.emailSent ? 'passed' : 'pending' as StepStatus },
      { label: 'Update Docs', status: s.docsUpdated ? 'passed' : 'pending' as StepStatus },
    ] : undefined,
  });

  return steps;
}

function getSubstepStatus(current: string | null | undefined, passedPhases: string[]): StepStatus {
  if (!current || current === 'none') return 'pending';
  const idx = passedPhases.indexOf(current);
  if (idx === 0) return 'active';
  if (idx > 0) return 'passed';
  return 'pending';
}

function getDefaultSteps(): LifecycleStep[] {
  return [
    { id: 'triage', label: 'Triage', description: 'Select a story to see its lifecycle', icon: <Zap className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'planning', label: 'Plan', description: '', icon: <FileText className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'deliberation', label: 'AI Deliberation', description: '', icon: <Brain className="w-4 h-4" />, actor: 'ai', status: 'pending' },
    { id: 'implement', label: 'Implement', description: '', icon: <GitPullRequest className="w-4 h-4" />, actor: 'ai', status: 'pending' },
    { id: 'review', label: 'Review PR', description: '', icon: <MessageSquare className="w-4 h-4" />, actor: 'human', status: 'pending' },
    { id: 'test', label: 'Test', description: '', icon: <TestTube className="w-4 h-4" />, actor: 'system', status: 'pending' },
    { id: 'deploy', label: 'Deploy', description: '', icon: <Rocket className="w-4 h-4" />, actor: 'system', status: 'pending' },
    { id: 'release', label: 'Release', description: '', icon: <Mail className="w-4 h-4" />, actor: 'system', status: 'pending' },
  ];
}

// ── Story lifecycle data shape ──

export interface StoryLifecycleData {
  id: string;
  title: string;
  status: string;
  epicId?: string | null;
  epicTitle?: string;
  triageApproved?: boolean | null;
  deliberationStatus?: string | null;
  deliberationId?: string | null;
  agentLoopStatus?: string | null;
  agentLoopId?: string | null;
  prNumber?: number | null;
  prUrl?: string | null;
  prMerged?: boolean;
  testsPass?: boolean | null;
  e2ePass?: StepStatus;
  unitPass?: StepStatus;
  uiPass?: StepStatus;
  deployed?: boolean;
  released?: boolean;
  version?: string | null;
  releaseNotesDone?: boolean;
  emailSent?: boolean;
  docsUpdated?: boolean;
}

// ── Progress summary bar ──

function ProgressSummary({ steps }: { steps: LifecycleStep[] }) {
  const total = steps.length;
  const passed = steps.filter(s => s.status === 'passed').length;
  const failed = steps.filter(s => s.status === 'failed').length;
  const active = steps.filter(s => s.status === 'active' || s.status === 'waiting_approval').length;
  const pct = Math.round((passed / total) * 100);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-zinc-400">
          {passed}/{total} steps complete
          {failed > 0 && <span className="text-red-400 ml-2">({failed} failed)</span>}
          {active > 0 && <span className="text-amber-400 ml-2">({active} need attention)</span>}
        </span>
        <span className="text-zinc-500">{pct}%</span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden flex">
        {steps.map((step, i) => {
          const color = step.status === 'passed' ? 'bg-emerald-500' :
                        step.status === 'failed' ? 'bg-red-500' :
                        step.status === 'active' ? 'bg-blue-500' :
                        step.status === 'waiting_approval' ? 'bg-amber-500' :
                        step.status === 'skipped' ? 'bg-zinc-600' : 'bg-zinc-800';
          return <div key={i} className={`h-full ${color}`} style={{ width: `${100 / steps.length}%` }} />;
        })}
      </div>
    </div>
  );
}

// ── Main exported component ──

interface DevLifecycleFlowProps {
  story?: StoryLifecycleData | null;
  stories?: StoryLifecycleData[];
  onGateAction?: (stepId: string, action: string, storyId?: string) => void;
  onSelectStory?: (storyId: string) => void;
}

export default function DevLifecycleFlow({ story, stories, onGateAction, onSelectStory }: DevLifecycleFlowProps) {
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(story?.id || null);
  const activeStory = story || stories?.find(s => s.id === selectedStoryId) || null;
  const steps = buildLifecycleSteps(activeStory);

  const handleGateAction = (stepId: string, action: string) => {
    onGateAction?.(stepId, action, activeStory?.id);
  };

  const handleSelectStory = (id: string) => {
    setSelectedStoryId(id);
    onSelectStory?.(id);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            Development Lifecycle
          </h3>
          {activeStory && (
            <p className="text-xs text-zinc-500 mt-0.5">{activeStory.title}</p>
          )}
        </div>
        {/* Legend */}
        <div className="flex gap-3 text-[10px]">
          {(['human', 'ai', 'system'] as Actor[]).map(a => {
            const badge = ACTOR_BADGE[a];
            return (
              <span key={a} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${badge.style}`}>
                {badge.icon} {badge.label}
              </span>
            );
          })}
        </div>
      </div>

      {/* Story selector if multiple stories provided */}
      {stories && stories.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {stories.map(s => (
            <button
              key={s.id}
              onClick={() => handleSelectStory(s.id)}
              className={`px-2 py-1 rounded text-xs border transition ${
                s.id === selectedStoryId
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {s.title.length > 40 ? s.title.substring(0, 40) + '...' : s.title}
            </button>
          ))}
        </div>
      )}

      {/* Progress bar */}
      <ProgressSummary steps={steps} />

      {/* Step cards with connectors */}
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={step.id}>
            <StepCard step={step} isLast={i === steps.length - 1} onGateAction={handleGateAction} />
            {i < steps.length - 1 && (
              <StepConnector fromStatus={step.status} toStatus={steps[i + 1].status} />
            )}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {!activeStory && !stories?.length && (
        <div className="text-center py-8 text-zinc-600 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Select a story from Planning to track its lifecycle
        </div>
      )}
    </div>
  );
}
