'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw, ChevronRight, ChevronDown, Layers, BookOpen, Circle, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import DevLifecycleFlow, { StoryLifecycleData } from './DevLifecycleFlow';

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
    { key: 'deliberation', done: story.deliberationStatus === 'completed' || story.deliberationStatus === 'consensus' },
    { key: 'implement', done: !!story.prNumber },
    { key: 'test', done: story.testsPass },
    { key: 'deploy', done: story.deployed },
    { key: 'release', done: story.released },
  ];
  const completed = phases.filter(p => p.done).length;
  return (
    <div className="flex items-center gap-0.5">
      {phases.map((p, i) => (
        <div key={p.key} className={`w-2 h-2 rounded-full ${p.done ? 'bg-emerald-500' : 'bg-zinc-700'}`} title={p.key} />
      ))}
      <span className="text-xs text-zinc-500 ml-1.5">{completed}/{phases.length}</span>
    </div>
  );
}

export default function LifecycleTab() {
  const [epics, setEpics] = useState<EpicGroup[]>([]);
  const [unassigned, setUnassigned] = useState<StoryLifecycleData[]>([]);
  const [selectedStory, setSelectedStory] = useState<StoryLifecycleData | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/lifecycle');
      const data = await res.json();
      if (data.stories) {
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
    } finally {
      setLoading(false);
    }
  }, [selectedStory, expandedEpics.size]);

  useEffect(() => { fetchData(); }, []);
  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const toggleEpic = (id: string) => {
    setExpandedEpics(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleGateAction = async (stepId: string, action: string, storyId?: string) => {
    if (!storyId) return;
    setActionLoading(`${stepId}-${action}`);
    try {
      const actionMap: Record<string, { url: string; method: string; body?: object }> = {
        'start-deliberation': {
          url: '/api/admin/cockpit/deliberation',
          method: 'POST',
          body: { type: 'implementation', storyId, title: selectedStory?.title || 'Review' },
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
        'skip-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'skip-deliberation', storyId } },
        'approve-decision': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'approve-decision', storyId } },
        'restart-deliberation': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'restart-deliberation', storyId } },
        'manual-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'manual-pr', storyId } },
        'manual-fix': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'manual-fix', storyId } },
        'approve-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'approve-pr', storyId } },
        'reject-pr': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'reject-pr', storyId } },
        'mark-tests-passed': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-tests-passed', storyId } },
        'mark-deployed': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-deployed', storyId } },
        'mark-released': { url: '/api/admin/cockpit/lifecycle', method: 'POST', body: { action: 'mark-released', storyId } },
        'deploy-release': {
          url: '/api/admin/cockpit/actions',
          method: 'POST',
          body: { action: 'deploy-release', storyId },
        },
      };
      const mapped = actionMap[action];
      if (mapped) {
        await fetch(mapped.url, {
          method: mapped.method,
          headers: { 'Content-Type': 'application/json' },
          body: mapped.body ? JSON.stringify(mapped.body) : undefined,
        });
      }
      await fetchData();
    } catch (err) {
      console.error('Gate action error:', err);
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Epic / Story browser */}
        <div className="lg:col-span-1 space-y-2">
          {epics.map(epic => {
            const isExpanded = expandedEpics.has(epic.id);
            const Icon = isExpanded ? ChevronDown : ChevronRight;
            const statusCfg = STATUS_DOT[epic.status] || STATUS_DOT.backlog;
            const StatusIcon = statusCfg.icon;
            return (
              <div key={epic.id} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleEpic(epic.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/60 transition text-left"
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
        <div className="lg:col-span-2">
          {selectedStory ? (
            <div className="space-y-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  {selectedStory.epicTitle && (
                    <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">{selectedStory.epicTitle}</span>
                  )}
                  <h3 className="text-sm font-medium text-zinc-200">{selectedStory.title}</h3>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Status: {selectedStory.status} · ID: {selectedStory.id.slice(0, 8)}</p>
              </div>
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
              <ChevronRight className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Select a story from the left to view its lifecycle</p>
              <p className="text-xs text-zinc-600 mt-1">Each story shows its progress through: Triage → Plan → Deliberate → Implement → Test → Deploy → Release</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
