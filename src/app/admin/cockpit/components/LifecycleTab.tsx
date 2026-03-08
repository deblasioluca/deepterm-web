'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ChevronRight, ChevronDown, Layers, BookOpen, Circle, CheckCircle2, XCircle, Clock, Zap, Wifi, WifiOff, Rocket, Package, GitMerge, Play, RotateCcw, SkipForward, AlertTriangle, Tag, ArrowDown } from 'lucide-react';
import DevLifecycleFlow, { StoryLifecycleData } from './DevLifecycleFlow';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface EpicGroup {
  id: string;
  title: string;
  status: string;
  stories: StoryLifecycleData[];
}

const STATUS_DOT: Record<string, { color: string; icon: typeof Circle }> = {
  backlog:      { color: 'text-zinc-500', icon: Circle },
  planned:      { color: 'text-blue-400', icon: Clock },
  in_progress:  { color: 'text-amber-400', icon: Zap },
  done:         { color: 'text-emerald-400', icon: CheckCircle2 },
  released:     { color: 'text-purple-400', icon: CheckCircle2 },
  cancelled:    { color: 'text-red-400', icon: XCircle },
};

function StoryProgress({ story }: { story: StoryLifecycleData }) {
  const phases = [
    { key: 'triage', done: story.triageApproved },
    { key: 'plan', done: !!story.epicId },
    { key: 'deliberation', done: story.deliberationStatus === 'decided' },
    { key: 'implement', done: !!story.prNumber },
    { key: 'review', done: story.prMerged },
    { key: 'test', done: story.testsPass },
    { key: 'deploy', done: story.deployed },
    { key: 'release', done: story.released },
  ];
  const completed = phases.filter(p => p.done).length;
  const pct = Math.round((completed / phases.length) * 100);
  const activeStep = story.lifecycleStep;
  return (
    <div className="flex items-center gap-1">
      {/* T4-3: Mini progress bar */}
      <div className="flex gap-px">
        {phases.map((p) => (
          <div key={p.key} className={`w-2.5 h-1.5 rounded-sm ${
            p.done ? 'bg-emerald-500'
            : p.key === activeStep ? 'bg-blue-500 animate-pulse'
            : 'bg-zinc-700'
          }`} title={p.key} />
        ))}
      </div>
      <span className="text-[10px] text-zinc-500 ml-0.5 tabular-nums">{pct}%</span>
    </div>
  );
}

// ── Epic-level Lifecycle Overview ──
const STORY_STEPS = [
  { id: 'triage',       label: 'Triage',     actor: 'You' },
  { id: 'deliberation', label: 'Deliberate', actor: 'AI' },
  { id: 'implement',    label: 'Implement',  actor: 'AI' },
  { id: 'test',         label: 'Test',       actor: 'CI' },
  { id: 'review',       label: 'Review',     actor: 'You' },
];

function epicStepStatus(story: StoryLifecycleData, stepId: string): string {
  if (story.status === "released") return "passed";
  const stepOrder = ["triage","plan","deliberation","implement","test","review","merged","deploy","release"];
  const cur = stepOrder.indexOf(story.lifecycleStep || "");
  const idx = stepOrder.indexOf(stepId);
  if (cur > idx) return "passed";
  if (story.lifecycleStep === stepId) return story.status === "in_progress" ? "active" : "pending";
  return "pending";
}

interface EpicGroup2 { id: string; title: string; status: string; stories: StoryLifecycleData[]; }
interface EpicLVProps { epic: EpicGroup2; onGateAction: (id: string, action: string) => Promise<void>; onSelectStory: (s: StoryLifecycleData) => void; }

function EpicLifecycleView({ epic, onGateAction, onSelectStory }: EpicLVProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [epicError, setEpicError] = useState<string | null>(null);
  const stories = epic.stories;
  const releaseType = (stories[0] as any)?.epicReleaseType || "minor";
  const targetVersion = (stories[0] as any)?.epicTargetVersion;
  const mergedCount = stories.filter(s => s.mergedAt || ["merged","deploy","release"].includes(s.lifecycleStep||"") || s.status==="released").length;
  const allMerged = mergedCount === stories.length;
  const deployStory = stories.find(s => ["deploy","release"].includes(s.lifecycleStep||""));
  const deployDone = stories.every(s => s.status==="released");
  const deployActive = !!deployStory && deployStory.lifecycleStep==="deploy";
  const releaseDone = deployDone;
  const releaseActive = !!deployStory && deployStory.lifecycleStep==="release";

  const doAction = async (storyId: string, action: string) => {
    setActionLoading(action + storyId);
    setEpicError(null);
    try { await onGateAction(storyId, action); }
    catch (e: any) { setEpicError(e.message || String(e)); }
    finally { setActionLoading(null); }
  };

  const dot = (st: string) => st==="passed" ? "bg-emerald-500 border-emerald-600" : st==="active" ? "bg-blue-500 border-blue-600 animate-pulse" : st==="merged_wait" ? "bg-amber-500 border-amber-600" : "bg-zinc-700 border-zinc-600";
  const txt = (st: string) => st==="passed" ? "text-emerald-400" : st==="active" ? "text-blue-400" : st==="merged_wait" ? "text-amber-400" : "text-zinc-600";

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Layers className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <h3 className="text-sm font-semibold text-zinc-100 truncate">{epic.title}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${releaseType==="major" ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : "bg-blue-500/20 text-blue-400 border-blue-500/30"}`}>{releaseType==="major" ? "Major" : "Minor"}</span>
              {targetVersion && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center gap-1"><Tag className="w-2.5 h-2.5" /> v{targetVersion}</span>}
            </div>
            <p className="text-xs text-zinc-500">{stories.length} stor{stories.length===1?"y":"ies"} · {mergedCount}/{stories.length} merged · {allMerged ? "All merged — ready to deploy" : mergedCount>0 ? `${stories.length-mergedCount} still in progress` : "In development"}</p>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${epic.status==="released"?"bg-purple-400":epic.status==="in_progress"?"bg-amber-400":epic.status==="done"?"bg-emerald-400":"bg-zinc-600"}`} />
        </div>
      </div>

      {epicError && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /><span className="flex-1">{epicError}</span>
          <button onClick={()=>setEpicError(null)} className="ml-auto hover:text-red-300">×</button>
        </div>
      )}

      {/* Story matrix + convergence */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">

        {/* Column headers */}
        <div className="grid border-b border-zinc-800" style={{gridTemplateColumns:"repeat("+stories.length+",1fr)"}}>
          {stories.map(s => (
            <button key={s.id} onClick={()=>onSelectStory(s)}
              className="px-3 py-2.5 text-left hover:bg-zinc-800/50 transition border-r border-zinc-800 last:border-r-0 group"
              title="Click to view story lifecycle">
              <div className="text-xs font-medium text-zinc-300 group-hover:text-zinc-100 truncate">{s.title}</div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className={`text-[10px] ${s.lifecycleStep==="merged"?"text-amber-400":s.status==="released"?"text-purple-400":s.status==="in_progress"?"text-blue-400":"text-zinc-600"}`}>
                  {s.lifecycleStep==="merged"?"⏳ waiting":s.status==="released"?"✓ released":s.lifecycleStep||s.status}
                </span>
                <ChevronRight className="w-3 h-3 text-zinc-700 group-hover:text-zinc-500 ml-auto" />
              </div>
            </button>
          ))}
        </div>

        {/* Per-story step rows */}
        {STORY_STEPS.map((step, si) => (
          <div key={step.id} className={`grid border-b border-zinc-800/50 ${si%2===0?"":"bg-zinc-950/30"}`} style={{gridTemplateColumns:"repeat("+stories.length+",1fr)"}}>
            {stories.map(s => {
              const st = epicStepStatus(s, step.id);
              return (
                <div key={s.id} className="px-3 py-2 border-r border-zinc-800/50 last:border-r-0 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full border flex-shrink-0 ${dot(st)}`} />
                  <span className={`text-xs font-medium ${txt(st)}`}>{step.label}</span>
                  <span className={`text-[10px] ml-auto ${st==="passed"?"text-emerald-600":st==="active"?"text-blue-500":"text-zinc-700"}`}>{step.actor}</span>
                </div>
              );
            })}
          </div>
        ))}

        {/* Merge status row */}
        <div className="grid border-b border-zinc-700 bg-zinc-950/50" style={{gridTemplateColumns:"repeat("+stories.length+",1fr)"}}>
          {stories.map(s => {
            const merged = s.mergedAt || ["merged","deploy","release"].includes(s.lifecycleStep||"") || s.status==="released";
            const waiting = s.lifecycleStep==="merged";
            return (
              <div key={s.id} className="px-3 py-2.5 border-r border-zinc-800/50 last:border-r-0 flex items-center gap-2">
                <GitMerge className={`w-3 h-3 flex-shrink-0 ${merged?"text-emerald-400":"text-zinc-700"}`} />
                <span className={`text-xs font-medium ${waiting?"text-amber-400":merged?"text-emerald-400":"text-zinc-600"}`}>
                  {waiting?"Waiting":merged?"Merged":"Pending"}
                </span>
              </div>
            );
          })}
        </div>

        {/* Convergence arrows */}
        <div className="flex border-b border-zinc-800/40 bg-zinc-950/20 py-1.5">
          {stories.map((_,i) => (
            <div key={i} className="flex justify-center" style={{width:`${100/stories.length}%`}}>
              <ArrowDown className={`w-4 h-4 ${allMerged?"text-emerald-500":mergedCount>0?"text-zinc-600":"text-zinc-800"}`} />
            </div>
          ))}
        </div>

        {/* ── EPIC DEPLOY ── */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${deployDone?"bg-emerald-500/20 border border-emerald-500/30":deployActive?"bg-blue-500/20 border border-blue-500/30":allMerged?"bg-amber-500/15 border border-amber-500/25":"bg-zinc-800 border border-zinc-700"}`}>
              <Rocket className={`w-4 h-4 ${deployDone?"text-emerald-400":deployActive?"text-blue-400 animate-pulse":allMerged?"text-amber-400":"text-zinc-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${deployDone?"text-emerald-400":deployActive?"text-blue-400":allMerged?"text-amber-300":"text-zinc-500"}`}>Epic Deploy</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${deployDone?"bg-emerald-500/10 text-emerald-500 border-emerald-500/20":deployActive?"bg-blue-500/10 text-blue-400 border-blue-500/20":allMerged?"bg-amber-500/10 text-amber-400 border-amber-500/20":"bg-zinc-800 text-zinc-600 border-zinc-700"}`}>
                  {deployDone?"complete":deployActive?"running":allMerged?"ready":`${mergedCount}/${stories.length} merged`}
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {deployDone?(targetVersion ? `Deployed as v${targetVersion}` : `Deployed`):deployActive?(targetVersion ? `Deploying v${targetVersion}…` : `Deploying…`):allMerged?"All stories merged — trigger deploy to bump version and build":"Waiting for all stories to merge"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {deployDone && deployStory && (
                <button disabled={!!actionLoading} onClick={()=>doAction(deployStory.id,"reset-step")} className="flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition">
                  <RotateCcw className="w-3 h-3" /> Reset
                </button>
              )}
              {!deployDone && !deployActive && allMerged && (
                <button disabled={!!actionLoading} onClick={()=>{ const t=stories.find(s=>s.lifecycleStep==="merged")||stories[0]; if(t) doAction(t.id,"deploy-release"); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/40 hover:bg-blue-500/30 disabled:opacity-40 transition">
                  {actionLoading?.startsWith("deploy-release") ? <Loader2 className="w-3 h-3 animate-spin"/> : <Play className="w-3 h-3"/>} Trigger Deploy
                </button>
              )}
              {deployActive && deployStory && (
                <button disabled={!!actionLoading} onClick={()=>doAction(deployStory.id,"mark-deployed")} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/25 disabled:opacity-40 transition">
                  <SkipForward className="w-3 h-3" /> Mark Deployed
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── EPIC RELEASE ── */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${releaseDone?"bg-purple-500/20 border border-purple-500/30":releaseActive?"bg-blue-500/20 border border-blue-500/30":"bg-zinc-800 border border-zinc-700"}`}>
              <Package className={`w-4 h-4 ${releaseDone?"text-purple-400":releaseActive?"text-blue-400 animate-pulse":"text-zinc-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-sm font-semibold ${releaseDone?"text-purple-400":releaseActive?"text-blue-400":"text-zinc-500"}`}>Epic Release</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${releaseDone?"bg-purple-500/10 text-purple-400 border-purple-500/20":releaseActive?"bg-blue-500/10 text-blue-400 border-blue-500/20":"bg-zinc-800 text-zinc-600 border-zinc-700"}`}>
                  {releaseDone?"released":releaseActive?"running":"pending"}
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                {releaseDone?(targetVersion ? `Released v${targetVersion} — users notified` : `Released — users notified`):releaseActive?"Publishing release notes, notifying users…":"Awaiting deploy completion"}
              </p>
            </div>
            {releaseActive && deployStory && (
              <button disabled={!!actionLoading} onClick={()=>doAction(deployStory.id,"mark-released")} className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 disabled:opacity-40 transition flex-shrink-0">
                {actionLoading?.startsWith("mark-released") ? <Loader2 className="w-3 h-3 animate-spin"/> : <Package className="w-3 h-3"/>} Mark Released
              </button>
            )}
            {releaseDone && <span className="text-[10px] text-purple-500 flex items-center gap-1 flex-shrink-0"><CheckCircle2 className="w-3 h-3" /> Complete</span>}
          </div>
        </div>
      </div>

      {/* Story quick-nav */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
        <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2 font-medium">Open Story Lifecycle</p>
        <div className="flex flex-wrap gap-2">
          {stories.map(s => (
            <button key={s.id} onClick={()=>onSelectStory(s)} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 hover:border-zinc-600 transition text-zinc-300">
              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.lifecycleStep==="merged"?"bg-amber-400":s.status==="released"?"bg-purple-400":s.status==="in_progress"?"bg-blue-400":"bg-zinc-600"}`} />
              <span className="truncate max-w-[160px]">{s.title}</span>
              <ChevronRight className="w-3 h-3 text-zinc-600 flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


export default function LifecycleTab() {
  const [epics, setEpics] = useState<EpicGroup[]>([]);
  const [unassigned, setUnassigned] = useState<StoryLifecycleData[]>([]);
  const [selectedStory, setSelectedStory] = useState<StoryLifecycleData | null>(null);
  const [selectedEpic, setSelectedEpic] = useState<EpicGroup | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollFast, setPollFast] = useState(false);
  const [ciRunner, setCiRunner] = useState<{ status: string; name: string; busy: boolean; checkedAt: string } | null>(null);
  const [consecutiveErrors, setConsecutiveErrors] = useState(0);
  const [connectionLost, setConnectionLost] = useState(false);

  const { setPageContext } = useAdminAI();

  // Update AI context with live lifecycle data so the assistant can see what's on screen
  useEffect(() => {
    const allStories = [...epics.flatMap(e => e.stories), ...unassigned];
    const activeStories = allStories.filter(s => s.status === 'in_progress');
    const blockedStories = allStories.filter(s =>
      s.status === 'in_progress' && (
        s.testsPass === false ||
        s.agentLoopStatus === 'failed' ||
        s.agentLoopStatus === 'error'
      )
    );

    setPageContext({
      page: 'DevOps / Lifecycle',
      summary: `${allStories.length} stories — ${activeStories.length} active${blockedStories.length > 0 ? `, ${blockedStories.length} blocked/failing` : ''}`,
      data: {
        totalStories: allStories.length,
        activeStories: activeStories.length,
        blockedStories: blockedStories.length,
        epics: epics.map(e => ({
          title: e.title,
          status: e.status,
          storyCount: e.stories.length,
        })),
        stories: allStories.map(s => ({
          id: s.id.slice(0, 8),
          title: s.title,
          status: s.status,
          lifecycleStep: s.lifecycleStep ?? null,
          agentLoopStatus: s.agentLoopStatus ?? null,
          deliberationStatus: s.deliberationStatus ?? null,
          testsPass: s.testsPass ?? null,
          e2ePass: s.e2ePass ?? null,
          unitPass: s.unitPass ?? null,
          prNumber: s.prNumber ?? null,
          prMerged: s.prMerged ?? false,
          deployed: s.deployed ?? false,
          loopCount: s.loopCount ?? null,
          lastLoopFrom: s.lastLoopFrom ?? null,
        })),
        selectedStory: selectedStory ? {
          id: selectedStory.id,
          title: selectedStory.title,
          status: selectedStory.status,
          lifecycleStep: selectedStory.lifecycleStep ?? null,
          agentLoopStatus: selectedStory.agentLoopStatus ?? null,
          deliberationStatus: selectedStory.deliberationStatus ?? null,
          prNumber: selectedStory.prNumber ?? null,
          prUrl: selectedStory.prUrl ?? null,
          prMerged: selectedStory.prMerged ?? false,
          testsPass: selectedStory.testsPass ?? null,
          e2ePass: selectedStory.e2ePass ?? null,
          unitPass: selectedStory.unitPass ?? null,
          uiPass: selectedStory.uiPass ?? null,
          deployed: selectedStory.deployed ?? false,
          released: selectedStory.released ?? false,
          loopCount: selectedStory.loopCount ?? null,
          lastLoopFrom: selectedStory.lastLoopFrom ?? null,
          lastLoopTo: selectedStory.lastLoopTo ?? null,
          recentEvents: (selectedStory.recentEvents ?? []).slice(0, 8),
          stepTimeouts: selectedStory.stepTimeouts ?? null,
        } : null,
      },
    });
    // No cleanup: when the tab changes, the DevOps parent's effect re-fires and overwrites
  }, [epics, unassigned, selectedStory, setPageContext]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/lifecycle');
      const data = await res.json();
      if (data.stories) {
        // Reset error state on success
        setConsecutiveErrors(0);
        setConnectionLost(false);
        // Store CI runner status
        if (data.ciRunner !== undefined) setCiRunner(data.ciRunner);
        // Group by epic
        const epicMap = new Map<string, EpicGroup>();
        const noEpic: StoryLifecycleData[] = [];

        for (const s of data.stories) {
          if (s.epicId && s.epicTitle) {
            if (!epicMap.has(s.epicId)) {
              epicMap.set(s.epicId, { id: s.epicId, title: s.epicTitle, status: 'in_progress', stories: [] });
            }
            epicMap.get(s.epicId)!.stories.push(s);
          } else {
            noEpic.push(s);
          }
        }

        // Determine epic status from stories
        for (const epic of Array.from(epicMap.values())) {
          const statuses = epic.stories.map(s => s.status);
          if (statuses.every(s => s === 'released')) epic.status = 'released';
          else if (statuses.every(s => s === 'done' || s === 'released')) epic.status = 'done';
          else if (statuses.some(s => s === 'in_progress')) epic.status = 'in_progress';
          else if (statuses.some(s => s === 'planned')) epic.status = 'planned';
          else epic.status = 'backlog';
        }

        const epicList = Array.from(epicMap.values()); const sorted = epicList.sort((a, b) => {
          const order = ['in_progress', 'planned', 'backlog', 'done', 'released'];
          return order.indexOf(a.status) - order.indexOf(b.status);
        });

        setEpics(sorted);
        setUnassigned(noEpic);

        // Auto-expand epics with in_progress stories
        const autoExpand = new Set<string>();
        for (const e of sorted) {
          if (e.stories.some(s => s.status === 'in_progress')) autoExpand.add(e.id);
        }
        if (autoExpand.size > 0 && expandedEpics.size === 0) setExpandedEpics(autoExpand);

        // Update selected story if it exists
        if (selectedStory) {
          const all = data.stories as StoryLifecycleData[];
          const updated = all.find((s: StoryLifecycleData) => s.id === selectedStory.id);
          if (updated) setSelectedStory(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch lifecycle data:', err);
      setConsecutiveErrors(prev => {
        const next = prev + 1;
        if (next >= 5) setConnectionLost(true);
        return next;
      });
    } finally {
      setLoading(false);
    }
  }, [selectedStory, expandedEpics.size]);

  useEffect(() => { fetchData(); }, []);
  // T4-2: Smart polling — fast (3s) after actions with 30s auto-stop, medium (5s) when active, slow (15s) idle
  // GAP-04: Exponential backoff on errors — double interval on each failure, cap at 60s
  const hasActiveLifecycle = [...epics.flatMap(e => e.stories), ...unassigned].some(s => s.lifecycleStep && s.status === 'in_progress');
  const baseInterval = pollFast ? 3000 : hasActiveLifecycle ? 5000 : 15000;
  const pollInterval = consecutiveErrors > 0
    ? Math.min(baseInterval * Math.pow(2, consecutiveErrors), 60000)
    : baseInterval;

  useEffect(() => {
    const interval = setInterval(fetchData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchData, pollInterval]);

  // Auto-stop fast polling after 30s
  useEffect(() => {
    if (!pollFast) return;
    const timeout = setTimeout(() => setPollFast(false), 30000);
    return () => clearTimeout(timeout);
  }, [pollFast]);

  const toggleEpic = (id: string) => {
    setExpandedEpics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGateAction = async (stepId: string, action: string, storyId?: string, reason?: string) => {
    if (!storyId) return;
    setActionLoading(`${stepId}-${action}`);
    try {
      const actionMap: Record<string, { url: string; method: string; body?: object }> = {
        'start-deliberation': {
          url: '/api/admin/cockpit/deliberation',
          method: 'POST',
          body: { type: 'implementation', storyId, title: selectedStory?.title || 'Review', instructions: selectedStory?.description || '' },
        },
        'start-agent': {
          url: '/api/admin/cockpit/agent-loop',
          method: 'POST',
          body: { storyId, configId: 'default' },
        },
        'retry-agent': {
          url: '/api/admin/cockpit/agent-loop',
          method: 'POST',
          body: { storyId, configId: 'default' },
        },
        'approve-triage': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'approve-triage', storyId } },
        'reject-triage': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'reject-triage', storyId, reason: reason || 'Rejected at triage' } },
        'defer-triage': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'defer-triage', storyId, reason: reason || 'Deferred for later' } },
        'skip-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'skip-deliberation', storyId } },
        'approve-decision': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'approve-decision', storyId } },
        'restart-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'restart-deliberation', storyId } },
        'manual-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'manual-pr', storyId } },
        'manual-fix': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'manual-fix', storyId } },
        'approve-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'approve-pr', storyId } },
        'reject-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'reject-pr', storyId } },
        'merge-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'merge-pr', storyId } },
        'mark-tests-passed': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-tests-passed', storyId } },
        'mark-deployed': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-deployed', storyId } },
        'hold-deploy': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'hold-deploy', storyId, reason: reason || 'Deployment held' } },
        'mark-released': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-released', storyId } },
        'deploy-release': {
          url: '/api/admin/cockpit/lifecycle',
          method: 'POST',
          body: { action: 'deploy-release', storyId },
        },
        // Recovery actions
        'retry-step': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'retry-step', storyId, stepId } },
        'skip-step': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'skip-step', storyId, stepId } },
        'cancel-step': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'cancel-step', storyId, stepId } },
        'reset-all': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'reset-all', storyId } },
        'force-complete': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'force-complete', storyId } },
        'back-to-implement': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'reset-to-step', storyId, stepId: 'implement' } },
        'force-continue': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'skip-step', storyId, stepId: 'test' } },
        // Loop-back actions (Lifecycle V2) — reason passed from FeedbackDialog or default
        'loop-test-to-implement': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'loop-test-to-implement', storyId, reason: reason || 'Test failure — auto-fix' } },
        'loop-test-to-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'loop-test-to-deliberation', storyId, reason: reason || 'Test failures require re-architecture' } },
        'loop-review-to-implement': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'loop-review-to-implement', storyId, reason: reason || 'Changes requested' } },
        'loop-review-to-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'loop-review-to-deliberation', storyId, reason: reason || 'Re-architect needed' } },
        'abandon-implementation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'abandon-implementation', storyId, reason: reason || 'Implementation abandoned' } },
      };
      const mapped = actionMap[action];
      if (mapped) {
        const res = await fetch(mapped.url, {
          method: mapped.method,
          headers: { 'Content-Type': 'application/json' },
          body: mapped.body ? JSON.stringify(mapped.body) : undefined,
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || `Action failed (HTTP ${res.status})`;
          setActionError(errMsg);
          throw new Error(errMsg); // propagate so GateButtons shows inline error
        }
        setActionError(null);
      }
      await fetchData();
      setPollFast(true); // Fast polling for 30s after action
    } catch (err) {
      console.error('Gate action error:', err);
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading lifecycle data...
      </div>
    );
  }

  const allStories = [...epics.flatMap(e => e.stories), ...unassigned];
  const totalStories = allStories.length;
  const activeStories = allStories.filter(s => s.status === 'in_progress').length;
  const doneStories = allStories.filter(s => s.status === 'done' || s.status === 'released').length;
  const hasLiveStep = allStories.some(s => s.lifecycleStep && s.status === 'in_progress');

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          {/* T4-1: LIVE/IDLE badge */}
          {hasLiveStep ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/30 text-zinc-500 border border-zinc-700/40">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
              IDLE
            </span>
          )}
          {/* CI Runner status badge */}
          {ciRunner && (
            ciRunner.status === 'online' ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400/80 border border-emerald-500/20" title={`${ciRunner.name} — ${ciRunner.busy ? 'busy' : 'idle'} (checked ${new Date(ciRunner.checkedAt).toLocaleTimeString()})`}>
                <Wifi className="w-2.5 h-2.5" />
                CI Mac {ciRunner.busy ? 'busy' : 'ready'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/15 text-red-400 border border-red-500/30 animate-pulse" title={`${ciRunner.name} is ${ciRunner.status} — CI jobs will queue until runner comes online (checked ${new Date(ciRunner.checkedAt).toLocaleTimeString()})`}>
                <WifiOff className="w-2.5 h-2.5" />
                CI Mac offline
              </span>
            )
          )}
          <span>{totalStories} stories across {epics.length} epics</span>
          {activeStories > 0 && <span className="text-amber-400">{activeStories} active</span>}
          {doneStories > 0 && <span className="text-emerald-400">{doneStories} completed</span>}
        </div>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* GAP-04: Connection lost banner */}
      {connectionLost && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Connection lost — retrying every {Math.round(pollInterval / 1000)}s...</span>
          <button onClick={() => { setConsecutiveErrors(0); setConnectionLost(false); fetchData(); }} className="ml-auto px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 transition text-[10px] font-medium">
            Retry now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3">
        {/* Left: Epic / Story browser */}
        <div className="space-y-2 min-w-0">
          {epics.map(epic => {
            const isExpanded = expandedEpics.has(epic.id);
            const Icon = isExpanded ? ChevronDown : ChevronRight;
            const statusCfg = STATUS_DOT[epic.status] || STATUS_DOT.backlog;
            const StatusIcon = statusCfg.icon;
            return (
              <div key={epic.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => { toggleEpic(epic.id); setSelectedEpic(epic); setSelectedStory(null); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/60 transition text-left ${selectedEpic?.id === epic.id && !selectedStory ? 'bg-zinc-800/40 border-l-2 border-indigo-500' : ''}`}
                >
                  <Icon className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                  <Layers className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-zinc-200 truncate flex-1">{epic.title}</span>
                  <StatusIcon className={`w-3 h-3 ${statusCfg.color} flex-shrink-0`} />
                  <span className="text-xs text-zinc-600">{epic.stories.length}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-zinc-800">
                    {epic.stories.map(story => {
                      const stCfg = STATUS_DOT[story.status] || STATUS_DOT.backlog;
                      const StIcon = stCfg.icon;
                      const isSelected = selectedStory?.id === story.id;
                      return (
                        <button
                          key={story.id}
                          onClick={() => { setSelectedStory(story); setSelectedEpic(null); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition border-l-2 ${
                            isSelected ? 'bg-zinc-800 border-blue-500' : 'border-transparent hover:bg-zinc-800/40'
                          }`}
                        >
                          <StIcon className={`w-3 h-3 ${stCfg.color} flex-shrink-0 ml-3`} />
                          <span className={`text-xs truncate flex-1 ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                            {story.title}
                          </span>
                          <StoryProgress story={story} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {unassigned.length > 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
              <div className="px-3 py-2.5 text-xs font-medium text-zinc-500 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5" /> Unassigned Stories
              </div>
              <div className="border-t border-zinc-800">
                {unassigned.map(story => {
                  const stCfg = STATUS_DOT[story.status] || STATUS_DOT.backlog;
                  const StIcon = stCfg.icon;
                  const isSelected = selectedStory?.id === story.id;
                  return (
                    <button
                      key={story.id}
                      onClick={() => setSelectedStory(story)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition border-l-2 ${
                        isSelected ? 'bg-zinc-800 border-blue-500' : 'border-transparent hover:bg-zinc-800/40'
                      }`}
                    >
                      <StIcon className={`w-3 h-3 ${stCfg.color} flex-shrink-0 ml-3`} />
                      <span className={`text-xs truncate flex-1 ${isSelected ? 'text-zinc-100' : 'text-zinc-400'}`}>
                        {story.title}
                      </span>
                      <StoryProgress story={story} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {epics.length === 0 && unassigned.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center">
              <Layers className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-500">No active epics or stories. Create one in the Planning tab.</p>
            </div>
          )}
        </div>

        {/* Right: Lifecycle flow for selected story */}
        <div className="min-w-0">
          {selectedEpic && !selectedStory ? (
            <EpicLifecycleView
              epic={selectedEpic}
              onGateAction={handleGateAction}
              onSelectStory={(s) => { setSelectedStory(s); setSelectedEpic(null); }}
            />
          ) : selectedStory ? (
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedStory.epicTitle && (
                    <button
                      onClick={() => { const e = epics.find(ep => ep.id === selectedStory.epicId); if (e) { setSelectedEpic(e); setSelectedStory(null); } }}
                      className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded hover:bg-indigo-500/20 transition flex items-center gap-1"
                      title="Back to epic overview"
                    >
                      <Layers className="w-3 h-3" /> {selectedStory.epicTitle}
                    </button>
                  )}
                  <h3 className="text-sm font-medium text-zinc-200">{selectedStory.title}</h3>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Status: {selectedStory.status} · ID: {selectedStory.id.slice(0, 8)}</p>
              </div>
              {actionError && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between">
                  <span>{actionError}</span>
                  <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-300 ml-2">×</button>
                </div>
              )}
              <DevLifecycleFlow
                story={selectedStory}
                stories={allStories}
                onGateAction={handleGateAction}
                onSelectStory={(id) => {
                  const found = allStories.find(s => s.id === id);
                  if (found) setSelectedStory(found);
                }}
              />
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-12 text-center">
              <Layers className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Click an epic for the overview, or a story for its lifecycle</p>
              <p className="text-xs text-zinc-600 mt-1">Epic view shows all stories converging into the shared Deploy → Release steps with full controls</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
