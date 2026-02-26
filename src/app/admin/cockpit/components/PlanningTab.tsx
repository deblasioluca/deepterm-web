'use client';

import { useState, useEffect } from 'react';
import {
  Plus,
  ChevronRight,
  ChevronDown,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Rocket,
  X,
  Check,
  Loader2,
  Brain,
  FileText,
} from 'lucide-react';
import type { PlanningData, Epic, Story, GithubIssuesData, RunAction } from '../types';
import { formatTimeAgo } from '../utils';
import { PriorityBadge, WorkflowStatusBadge } from './shared';
import DeliberationPanel from './DeliberationPanel';
import ImplementationReport from './ImplementationReport';

const STATUSES = ['backlog', 'planned', 'in_progress', 'done', 'released'] as const;
const PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;

interface PlanningTabProps {
  planning: PlanningData;
  githubIssues: GithubIssuesData;
  runAction: RunAction;
  actionLoading: string | null;
  onDataChange: () => void;
}

export default function PlanningTab({ planning, githubIssues, runAction, actionLoading, onDataChange }: PlanningTabProps) {
  const [epics, setEpics] = useState<Epic[]>(planning.epics);
  const [unassignedStories, setUnassignedStories] = useState<Story[]>(planning.unassignedStories);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set());
  const [showCreateEpic, setShowCreateEpic] = useState(false);
  const [showCreateStory, setShowCreateStory] = useState<string | null>(null); // epicId or 'unassigned'
  const [editingEpic, setEditingEpic] = useState<string | null>(null);
  const [editingStory, setEditingStory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deliberatingFor, setDeliberatingFor] = useState<{ id: string; type: 'story' | 'epic'; deliberationId?: string } | null>(null);
  const [reportFor, setReportFor] = useState<{ id: string; type: 'story' | 'epic' } | null>(null);
  const [startingDeliberation, setStartingDeliberation] = useState<string | null>(null);

  // Sync from parent on auto-refresh
  useEffect(() => {
    setEpics(planning.epics);
    setUnassignedStories(planning.unassignedStories);
  }, [planning]);

  // --- CRUD helpers ---

  const createEpic = async (data: { title: string; description: string; priority: string; status: string }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cockpit/planning/epics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const epic = await res.json();
        setEpics((prev) => [...prev, { ...epic, stories: [] }]);
        setShowCreateEpic(false);
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateEpic = async (id: string, data: Partial<Epic>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cockpit/planning/epics/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        setEpics((prev) => prev.map((e) => (e.id === id ? { ...updated, stories: e.stories } : e)));
        setEditingEpic(null);
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteEpic = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cockpit/planning/epics/${id}`, { method: 'DELETE' });
      if (res.ok) {
        const epic = epics.find((e) => e.id === id);
        setEpics((prev) => prev.filter((e) => e.id !== id));
        // Orphaned stories become unassigned
        if (epic?.stories.length) {
          setUnassignedStories((prev) => [...prev, ...epic.stories.map((s) => ({ ...s, epicId: null }))]);
        }
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const createStory = async (data: { title: string; description: string; priority: string; status: string; epicId: string | null; githubIssueNumber: number | null }) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/cockpit/planning/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const story = await res.json();
        if (story.epicId) {
          setEpics((prev) => prev.map((e) => (e.id === story.epicId ? { ...e, stories: [...e.stories, story] } : e)));
        } else {
          setUnassignedStories((prev) => [...prev, story]);
        }
        setShowCreateStory(null);
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateStory = async (id: string, data: Partial<Story>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cockpit/planning/stories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const updated = await res.json();
        // Update in epics
        setEpics((prev) => prev.map((e) => ({
          ...e,
          stories: e.stories.map((s) => (s.id === id ? updated : s)),
        })));
        // Update in unassigned
        setUnassignedStories((prev) => prev.map((s) => (s.id === id ? updated : s)));
        setEditingStory(null);
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteStory = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cockpit/planning/stories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setEpics((prev) => prev.map((e) => ({ ...e, stories: e.stories.filter((s) => s.id !== id) })));
        setUnassignedStories((prev) => prev.filter((s) => s.id !== id));
        onDataChange();
      }
    } finally {
      setSaving(false);
    }
  };

  const reorderStories = async (epicId: string | null, stories: Story[], idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= stories.length) return;

    const items = stories.map((s, i) => ({ ...s, sortOrder: i }));
    [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
    const reordered = items.map((s, i) => ({ ...s, sortOrder: i }));

    // Optimistic update
    if (epicId) {
      setEpics((prev) => prev.map((e) => (e.id === epicId ? { ...e, stories: reordered } : e)));
    } else {
      setUnassignedStories(reordered);
    }

    await fetch('/api/admin/cockpit/planning/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'story',
        items: reordered.map((s) => ({ id: s.id, sortOrder: s.sortOrder })),
      }),
    });
  };

  const reorderEpics = async (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= epics.length) return;

    const items = [...epics];
    [items[idx], items[targetIdx]] = [items[targetIdx], items[idx]];
    const reordered = items.map((e, i) => ({ ...e, sortOrder: i }));
    setEpics(reordered);

    await fetch('/api/admin/cockpit/planning/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'epic',
        items: reordered.map((e) => ({ id: e.id, sortOrder: e.sortOrder })),
      }),
    });
  };

  // --- Deliberation helpers ---

  const startDeliberation = async (targetId: string, targetType: 'story' | 'epic') => {
    setStartingDeliberation(targetId);
    try {
      const body: Record<string, string> = { type: 'implementation' };
      if (targetType === 'story') body.storyId = targetId;
      else body.epicId = targetId;
      const res = await fetch('/api/admin/cockpit/deliberation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const result = await res.json();
        setDeliberatingFor({ id: targetId, type: targetType, deliberationId: result.id });
      }
    } finally {
      setStartingDeliberation(null);
    }
  };

  const openDeliberation = (targetId: string, targetType: 'story' | 'epic', activeDeliberationId?: string | null) => {
    if (activeDeliberationId) {
      setDeliberatingFor({ id: targetId, type: targetType, deliberationId: activeDeliberationId });
    } else {
      startDeliberation(targetId, targetType);
    }
  };

  // --- Filter ---
  const filteredEpics = statusFilter
    ? epics.filter((e) => e.status === statusFilter || e.stories.some((s) => s.status === statusFilter))
    : epics;

  const filteredUnassigned = statusFilter
    ? unassignedStories.filter((s) => s.status === statusFilter)
    : unassignedStories;

  const toggleExpand = (id: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-300">Planning</h2>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin text-zinc-500" />}
        </div>
        <button
          onClick={() => setShowCreateEpic(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
        >
          <Plus className="w-3.5 h-3.5" /> Epic
        </button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => setStatusFilter(null)}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
            statusFilter === null ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          All
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              statusFilter === s ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Create Epic form */}
      {showCreateEpic && (
        <InlineForm
          type="epic"
          onSave={(data) => createEpic(data as { title: string; description: string; priority: string; status: string })}
          onCancel={() => setShowCreateEpic(false)}
          saving={saving}
        />
      )}

      {/* Epics */}
      {filteredEpics.map((epic, epicIdx) => {
        const expanded = expandedEpics.has(epic.id);
        const doneCount = epic.stories.filter((s) => s.status === 'done' || s.status === 'released').length;
        const filteredStories = statusFilter
          ? epic.stories.filter((s) => s.status === statusFilter)
          : epic.stories;

        return (
          <div key={epic.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Epic header */}
            {editingEpic === epic.id ? (
              <InlineForm
                type="epic"
                initial={epic}
                onSave={(data) => updateEpic(epic.id, data)}
                onCancel={() => setEditingEpic(null)}
                saving={saving}
              />
            ) : (
              <div className="flex items-center gap-3 p-3 hover:bg-zinc-800/30 transition">
                <button onClick={() => toggleExpand(epic.id)} className="text-zinc-500 hover:text-zinc-300">
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <PriorityBadge priority={epic.priority} />
                <span className="text-sm text-zinc-200 font-medium flex-1 truncate">{epic.title}</span>
                <WorkflowStatusBadge status={epic.status} />
                <span className="text-xs text-zinc-500">
                  {doneCount}/{epic.stories.length} stories
                </span>
                {(epic.deliberationCount ?? 0) > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                    {epic.deliberationCount} delib
                  </span>
                )}
                {epic.hasReport && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    report
                  </span>
                )}
                {(epic.aiCostCents ?? 0) > 0 && (
                  <span className="text-[10px] text-zinc-500" title="AI cost">
                    ${((epic.aiCostCents ?? 0) / 100).toFixed(2)}
                  </span>
                )}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openDeliberation(epic.id, 'epic', epic.activeDeliberationId)}
                    disabled={startingDeliberation === epic.id}
                    className="p-1 rounded text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
                    title="Deliberate"
                  >
                    {startingDeliberation === epic.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => setReportFor({ id: epic.id, type: 'epic' })}
                    className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition"
                    title="Implementation Report"
                  >
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  {epic.status === 'done' && (
                    <button
                      onClick={() => runAction('release-epic', { epicId: epic.id })}
                      disabled={actionLoading !== null}
                      className="p-1 rounded text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
                      title="Release"
                    >
                      <Rocket className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button onClick={() => reorderEpics(epicIdx, -1)} className="p-1 text-zinc-500 hover:text-zinc-300" title="Move up">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => reorderEpics(epicIdx, 1)} className="p-1 text-zinc-500 hover:text-zinc-300" title="Move down">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setEditingEpic(epic.id)} className="p-1 text-zinc-500 hover:text-zinc-300" title="Edit">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => deleteEpic(epic.id)} className="p-1 text-zinc-500 hover:text-red-400" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Inline Deliberation Panel for Epic */}
            {deliberatingFor?.id === epic.id && deliberatingFor.deliberationId && (
              <div className="border-t border-zinc-800 p-3">
                <DeliberationPanel
                  deliberationId={deliberatingFor.deliberationId}
                  onClose={() => setDeliberatingFor(null)}
                />
              </div>
            )}

            {/* Inline Report for Epic */}
            {reportFor?.id === epic.id && (
              <div className="border-t border-zinc-800 p-3">
                <ImplementationReport
                  targetId={epic.id}
                  targetType="epic"
                  onClose={() => setReportFor(null)}
                />
              </div>
            )}

            {/* Stories */}
            {expanded && (
              <div className="border-t border-zinc-800">
                {filteredStories.length === 0 && !showCreateStory ? (
                  <div className="p-3 pl-10 text-xs text-zinc-500">No stories yet</div>
                ) : (
                  <div className="divide-y divide-zinc-800/50">
                    {filteredStories.map((story, storyIdx) => (
                      <StoryRow
                        key={story.id}
                        story={story}
                        idx={storyIdx}
                        totalStories={filteredStories.length}
                        editing={editingStory === story.id}
                        saving={saving}
                        actionLoading={actionLoading}
                        onEdit={() => setEditingStory(story.id)}
                        onCancelEdit={() => setEditingStory(null)}
                        onSave={(data) => updateStory(story.id, data)}
                        onDelete={() => deleteStory(story.id)}
                        onReorder={(dir) => reorderStories(epic.id, filteredStories, storyIdx, dir)}
                        onRelease={() => runAction('release-story', { storyId: story.id })}
                        onDeliberate={() => openDeliberation(story.id, 'story', story.activeDeliberationId)}
                        onReport={() => setReportFor({ id: story.id, type: 'story' })}
                        isDeliberating={deliberatingFor?.id === story.id}
                        isStartingDeliberation={startingDeliberation === story.id}
                        showDelibPanel={deliberatingFor?.id === story.id && !!deliberatingFor.deliberationId}
                        deliberationId={deliberatingFor?.id === story.id ? deliberatingFor.deliberationId : undefined}
                        showReportPanel={reportFor?.id === story.id}
                        onCloseDelib={() => setDeliberatingFor(null)}
                        onCloseReport={() => setReportFor(null)}
                      />
                    ))}
                  </div>
                )}

                {showCreateStory === epic.id ? (
                  <div className="p-3 pl-10">
                    <InlineForm
                      type="story"
                      onSave={(data) => createStory({ ...(data as { title: string; description: string; priority: string; status: string; githubIssueNumber: number | null }), epicId: epic.id })}
                      onCancel={() => setShowCreateStory(null)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCreateStory(epic.id)}
                    className="flex items-center gap-1.5 px-3 py-2 pl-10 text-xs text-zinc-500 hover:text-zinc-300 transition w-full text-left"
                  >
                    <Plus className="w-3 h-3" /> Story
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unassigned Stories */}
      {(filteredUnassigned.length > 0 || showCreateStory === 'unassigned') && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Unassigned Stories</span>
          </div>
          <div className="divide-y divide-zinc-800/50">
            {filteredUnassigned.map((story, idx) => (
              <StoryRow
                key={story.id}
                story={story}
                idx={idx}
                totalStories={filteredUnassigned.length}
                editing={editingStory === story.id}
                saving={saving}
                actionLoading={actionLoading}
                onEdit={() => setEditingStory(story.id)}
                onCancelEdit={() => setEditingStory(null)}
                onSave={(data) => updateStory(story.id, data)}
                onDelete={() => deleteStory(story.id)}
                onReorder={(dir) => reorderStories(null, filteredUnassigned, idx, dir)}
                onRelease={() => runAction('release-story', { storyId: story.id })}
                onDeliberate={() => openDeliberation(story.id, 'story', story.activeDeliberationId)}
                onReport={() => setReportFor({ id: story.id, type: 'story' })}
                isDeliberating={deliberatingFor?.id === story.id}
                isStartingDeliberation={startingDeliberation === story.id}
                showDelibPanel={deliberatingFor?.id === story.id && !!deliberatingFor.deliberationId}
                deliberationId={deliberatingFor?.id === story.id ? deliberatingFor.deliberationId : undefined}
                showReportPanel={reportFor?.id === story.id}
                onCloseDelib={() => setDeliberatingFor(null)}
                onCloseReport={() => setReportFor(null)}
              />
            ))}
          </div>
          {showCreateStory === 'unassigned' ? (
            <div className="p-3 pl-10">
              <InlineForm
                type="story"
                onSave={(data) => createStory({ ...(data as { title: string; description: string; priority: string; status: string; githubIssueNumber: number | null }), epicId: null })}
                onCancel={() => setShowCreateStory(null)}
                saving={saving}
              />
            </div>
          ) : (
            <button
              onClick={() => setShowCreateStory('unassigned')}
              className="flex items-center gap-1.5 px-3 py-2 pl-10 text-xs text-zinc-500 hover:text-zinc-300 transition w-full text-left"
            >
              <Plus className="w-3 h-3" /> Story
            </button>
          )}
        </div>
      )}

      {filteredEpics.length === 0 && filteredUnassigned.length === 0 && !showCreateEpic && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500 text-sm mb-3">No epics or stories yet</p>
          <button
            onClick={() => setShowCreateEpic(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-zinc-300 hover:bg-zinc-700 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Create your first Epic
          </button>
        </div>
      )}
    </div>
  );
}

// --- Story Row ---

interface StoryRowProps {
  story: Story;
  idx: number;
  totalStories: number;
  editing: boolean;
  saving: boolean;
  actionLoading: string | null;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (data: Partial<Story>) => void;
  onDelete: () => void;
  onReorder: (direction: -1 | 1) => void;
  onRelease: () => void;
  onDeliberate: () => void;
  onReport: () => void;
  isDeliberating: boolean;
  isStartingDeliberation: boolean;
  showDelibPanel: boolean;
  deliberationId?: string;
  showReportPanel: boolean;
  onCloseDelib: () => void;
  onCloseReport: () => void;
}

function StoryRow({ story, idx, totalStories, editing, saving, actionLoading, onEdit, onCancelEdit, onSave, onDelete, onReorder, onRelease, onDeliberate, onReport, isStartingDeliberation, showDelibPanel, deliberationId, showReportPanel, onCloseDelib, onCloseReport }: StoryRowProps) {
  if (editing) {
    return (
      <div className="p-3 pl-10">
        <InlineForm
          type="story"
          initial={story}
          onSave={onSave}
          onCancel={onCancelEdit}
          saving={saving}
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 p-2.5 pl-10 hover:bg-zinc-800/30 transition">
        <PriorityBadge priority={story.priority} />
        <span className="text-xs text-zinc-200 flex-1 truncate">{story.title}</span>
        <WorkflowStatusBadge status={story.status} />
        {story.githubIssueNumber && (
          <a
            href={`https://github.com/deblasioluca/deepterm/issues/${story.githubIssueNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
          >
            #{story.githubIssueNumber}
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        {(story.deliberationCount ?? 0) > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
            {story.deliberationCount}
          </span>
        )}
        {story.hasReport && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Has report" />
        )}
        {(story.aiCostCents ?? 0) > 0 && (
          <span className="text-[10px] text-zinc-500" title="AI cost">
            ${((story.aiCostCents ?? 0) / 100).toFixed(2)}
          </span>
        )}
        <div className="flex items-center gap-0.5">
          <button
            onClick={onDeliberate}
            disabled={isStartingDeliberation}
            className="p-1 rounded text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
            title="Deliberate"
          >
            {isStartingDeliberation ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
          </button>
          <button
            onClick={onReport}
            className="p-1 rounded text-emerald-400 hover:bg-emerald-500/10 transition"
            title="Implementation Report"
          >
            <FileText className="w-3 h-3" />
          </button>
          {story.status === 'done' && (
            <button
              onClick={onRelease}
              disabled={actionLoading !== null}
              className="p-1 rounded text-purple-400 hover:bg-purple-500/10 transition disabled:opacity-50"
              title="Release"
            >
              <Rocket className="w-3 h-3" />
            </button>
          )}
          <button onClick={() => onReorder(-1)} disabled={idx === 0} className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30">
            <ArrowUp className="w-3 h-3" />
          </button>
          <button onClick={() => onReorder(1)} disabled={idx === totalStories - 1} className="p-1 text-zinc-500 hover:text-zinc-300 disabled:opacity-30">
            <ArrowDown className="w-3 h-3" />
          </button>
          <button onClick={onEdit} className="p-1 text-zinc-500 hover:text-zinc-300">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 text-zinc-500 hover:text-red-400">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {showDelibPanel && deliberationId && (
        <div className="p-3 pl-10 border-t border-zinc-800/50">
          <DeliberationPanel deliberationId={deliberationId} onClose={onCloseDelib} />
        </div>
      )}
      {showReportPanel && (
        <div className="p-3 pl-10 border-t border-zinc-800/50">
          <ImplementationReport targetId={story.id} targetType="story" onClose={onCloseReport} />
        </div>
      )}
    </>
  );
}

// --- Inline Form ---

interface InlineFormProps {
  type: 'epic' | 'story';
  initial?: Partial<Epic & Story>;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  saving: boolean;
}

function InlineForm({ type, initial, onSave, onCancel, saving }: InlineFormProps) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [priority, setPriority] = useState(initial?.priority || 'medium');
  const [status, setStatus] = useState(initial?.status || 'backlog');
  const [githubIssueNumber, setGithubIssueNumber] = useState<string>(
    initial?.githubIssueNumber?.toString() || ''
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const data: Record<string, unknown> = { title: title.trim(), description, priority, status };
    if (type === 'story') {
      data.githubIssueNumber = githubIssueNumber ? parseInt(githubIssueNumber, 10) : null;
    }
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-3 space-y-2">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`${type === 'epic' ? 'Epic' : 'Story'} title...`}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
        autoFocus
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
      />
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        {type === 'story' && (
          <input
            type="number"
            value={githubIssueNumber}
            onChange={(e) => setGithubIssueNumber(e.target.value)}
            placeholder="GitHub #"
            className="w-20 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        )}
        <div className="flex items-center gap-1 ml-auto">
          <button
            type="submit"
            disabled={!title.trim() || saving}
            className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-md text-xs font-medium hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {initial ? 'Save' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 px-2.5 py-1 bg-zinc-700/50 text-zinc-400 border border-zinc-600/50 rounded-md text-xs font-medium hover:bg-zinc-700 transition"
          >
            <X className="w-3 h-3" /> Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
