'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  RefreshCw,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  FileText,
  Layers,
  Ban,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

// ── Types ────────────────────────────────────────────────────────────────────

interface ContentUpdateJob {
  id: string;
  type: string;
  status: string;
  sections: string;
  triggeredBy: string;
  progress: number;
  logs: string;
  result: string | null;
  error: string | null;
  workflowRunId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PageData {
  jobs: ContentUpdateJob[];
  activeJob: ContentUpdateJob | null;
  availableSections: string[];
}

// ── Section icons/labels ─────────────────────────────────────────────────────

const SECTION_META: Record<string, { label: string; icon: string }> = {
  dashboard: { label: 'Dashboard', icon: 'layout-dashboard' },
  connections: { label: 'Connections', icon: 'plug' },
  vault: { label: 'Vault', icon: 'lock' },
  terminal: { label: 'Terminal', icon: 'terminal' },
  settings: { label: 'Settings', icon: 'settings' },
  sftp: { label: 'SFTP', icon: 'folder-tree' },
  'ai-chat': { label: 'AI Chat', icon: 'bot' },
  collaboration: { label: 'Collaboration', icon: 'users' },
  documentation: { label: 'Documentation', icon: 'book-open' },
  pricing: { label: 'Pricing', icon: 'credit-card' },
};

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return 'text-emerald-400';
    case 'running': return 'text-blue-400';
    case 'queued': return 'text-amber-400';
    case 'failed': return 'text-red-400';
    case 'cancelled': return 'text-zinc-400';
    default: return 'text-zinc-400';
  }
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'completed': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case 'running': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
    case 'queued': return <Clock className="w-4 h-4 text-amber-400" />;
    case 'failed': return <XCircle className="w-4 h-4 text-red-400" />;
    case 'cancelled': return <Ban className="w-4 h-4 text-zinc-400" />;
    default: return <Clock className="w-4 h-4 text-zinc-400" />;
  }
}

function typeIcon(type: string) {
  switch (type) {
    case 'screenshots': return <Camera className="w-4 h-4" />;
    case 'content': return <FileText className="w-4 h-4" />;
    default: return <Layers className="w-4 h-4" />;
  }
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ContentUpdatePage() {
  const [data, setData] = useState<PageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<{ msg: string; ok: boolean } | null>(null);

  // New job form
  const [selectedType, setSelectedType] = useState<'full' | 'screenshots' | 'content'>('full');
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);

  // Expanded job logs
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const { setPageContext } = useAdminAI();
  useEffect(() => {
    setPageContext({
      page: 'Content Update',
      summary: 'Admin content update management — trigger screenshot/content refreshes',
      data: { activeJob: data?.activeJob?.id ?? null, totalJobs: data?.jobs?.length ?? 0 },
    });
    return () => setPageContext(null);
  }, [data, setPageContext]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/content-update');
      if (res.ok) setData(await res.json());
    } catch (error) {
      console.error('Failed to fetch content update data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh when there's an active job
  useEffect(() => {
    if (!data?.activeJob) return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [data?.activeJob, fetchData]);

  // Auto-expand active job
  useEffect(() => {
    if (data?.activeJob) {
      setExpandedJobId(data.activeJob.id);
    }
  }, [data?.activeJob]);

  const triggerUpdate = async () => {
    setActionLoading(true);
    setActionResult(null);
    try {
      const sections = selectAll ? [] : Array.from(selectedSections);
      const res = await fetch('/api/admin/content-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, sections }),
      });
      const result = await res.json();
      if (res.ok) {
        setActionResult({ msg: 'Update job started', ok: true });
        fetchData();
      } else {
        setActionResult({ msg: result.error || 'Failed to start update', ok: false });
      }
    } catch {
      setActionResult({ msg: 'Network error', ok: false });
    } finally {
      setActionLoading(false);
    }
  };

  const cancelJob = async (jobId: string) => {
    try {
      const res = await fetch('/api/admin/content-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', jobId }),
      });
      if (res.ok) fetchData();
    } catch {
      // Silent
    }
  };

  const toggleSection = (section: string) => {
    if (selectAll) {
      // Transitioning out of select-all: fill set with all sections except the toggled one
      const allSections = data?.availableSections ?? [];
      setSelectedSections(new Set(allSections.filter(s => s !== section)));
      setSelectAll(false);
    } else {
      setSelectedSections((prev) => {
        const next = new Set(prev);
        if (next.has(section)) next.delete(section);
        else next.add(section);
        return next;
      });
    }
  };

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectAll(false);
      setSelectedSections(new Set());
    } else {
      setSelectAll(true);
      setSelectedSections(new Set());
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Content Update</h1>
            <p className="text-text-secondary">Trigger content and screenshot updates for the web app</p>
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-background-tertiary text-text-secondary hover:text-text-primary rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>

        {/* Trigger Section */}
        <Card className="mb-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Trigger Update</h2>

          {/* Update Type */}
          <div className="mb-4">
            <label className="text-sm text-text-secondary mb-2 block">Update Type</label>
            <div className="flex gap-3">
              {([
                { value: 'full', label: 'Full Update', desc: 'Content + Screenshots', icon: Layers },
                { value: 'screenshots', label: 'Screenshots Only', desc: 'Re-capture app screenshots', icon: Camera },
                { value: 'content', label: 'Content Only', desc: 'Update text/data content', icon: FileText },
              ] as const).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedType(opt.value)}
                    className={`flex-1 p-4 rounded-xl border transition-all ${
                      selectedType === opt.value
                        ? 'border-accent-primary bg-accent-primary/10'
                        : 'border-border hover:border-accent-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Icon className={`w-4 h-4 ${selectedType === opt.value ? 'text-accent-primary' : 'text-text-tertiary'}`} />
                      <span className={`text-sm font-medium ${selectedType === opt.value ? 'text-accent-primary' : 'text-text-primary'}`}>
                        {opt.label}
                      </span>
                    </div>
                    <p className="text-xs text-text-tertiary">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Sections to Update</label>
              <button
                onClick={toggleSelectAll}
                className="text-xs text-accent-primary hover:text-accent-primary/80"
              >
                {selectAll ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(data?.availableSections ?? []).map((section) => {
                const meta = SECTION_META[section] || { label: section, icon: 'box' };
                const isSelected = selectAll || selectedSections.has(section);
                return (
                  <button
                    key={section}
                    onClick={() => toggleSection(section)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      isSelected
                        ? 'border-accent-primary/50 bg-accent-primary/10 text-accent-primary'
                        : 'border-border text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Trigger Button */}
          <div className="flex items-center gap-4">
            <button
              onClick={triggerUpdate}
              disabled={actionLoading || !!data?.activeJob || (!selectAll && selectedSections.size === 0)}
              className="flex items-center gap-2 px-6 py-3 bg-accent-primary text-white rounded-xl font-medium hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start Update
            </button>

            {data?.activeJob && (
              <span className="text-sm text-amber-400 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                A job is currently running
              </span>
            )}

            {actionResult && (
              <span className={`text-sm ${actionResult.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {actionResult.msg}
              </span>
            )}
          </div>
        </Card>

        {/* Active Job */}
        {data?.activeJob && (
          <Card className="mb-6 border-accent-primary/30">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-accent-primary animate-spin" />
                Active Job
              </h2>
              <button
                onClick={() => cancelJob(data.activeJob!.id)}
                className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg text-xs hover:bg-red-500/20 transition-colors"
              >
                <Ban className="w-3 h-3" /> Cancel
              </button>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-text-secondary">Progress</span>
                <span className="text-sm font-medium text-text-primary">{data.activeJob.progress}%</span>
              </div>
              <div className="w-full bg-background-tertiary rounded-full h-2">
                <div
                  className="bg-accent-primary h-2 rounded-full transition-all duration-500"
                  style={{ width: `${data.activeJob.progress}%` }}
                />
              </div>
            </div>

            {/* Live Logs */}
            <div className="bg-background-tertiary rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-text-secondary">
              {data.activeJob.logs.split('\n').filter(Boolean).map((line, i) => (
                <div key={i} className="py-0.5">
                  <Terminal className="w-3 h-3 inline mr-2 text-text-tertiary" />
                  {line}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Job History */}
        <Card>
          <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent-primary" />
            Update History
          </h2>

          {data?.jobs?.length ? (
            <div className="space-y-2">
              {data.jobs.map((job) => {
                const isExpanded = expandedJobId === job.id;
                const sections = (() => {
                  try { return JSON.parse(job.sections) as string[]; }
                  catch { return []; }
                })();

                return (
                  <div key={job.id} className="border border-border rounded-xl overflow-hidden">
                    {/* Job Header */}
                    <button
                      onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-background-tertiary/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <StatusIcon status={job.status} />
                        <div className="flex items-center gap-2">
                          {typeIcon(job.type)}
                          <span className="text-sm font-medium text-text-primary capitalize">{job.type}</span>
                        </div>
                        <Badge variant="secondary" className={statusColor(job.status)}>
                          {job.status}
                        </Badge>
                        {job.progress > 0 && job.progress < 100 && (
                          <span className="text-xs text-text-tertiary">{job.progress}%</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-text-tertiary">
                          {new Date(job.createdAt).toLocaleString()}
                        </span>
                        {job.triggeredBy !== 'admin' && (
                          <Badge variant="secondary">{job.triggeredBy}</Badge>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-text-tertiary" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-text-tertiary" />
                        )}
                      </div>
                    </button>

                    {/* Expanded Details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-border">
                        <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                          <div>
                            <span className="text-text-tertiary">Sections:</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {sections.map((s) => (
                                <Badge key={s} variant="secondary">{SECTION_META[s]?.label ?? s}</Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <span className="text-text-tertiary">Duration:</span>
                            <p className="text-text-primary">
                              {job.startedAt && job.completedAt
                                ? `${Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)}s`
                                : job.startedAt
                                ? 'In progress...'
                                : 'Queued'}
                            </p>
                          </div>
                        </div>

                        {job.error && (
                          <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-sm text-red-400">{job.error}</p>
                          </div>
                        )}

                        {/* Logs */}
                        {job.logs && (
                          <div className="mt-3 bg-background-tertiary rounded-lg p-3 max-h-48 overflow-y-auto font-mono text-xs text-text-secondary">
                            {job.logs.split('\n').filter(Boolean).map((line, i) => (
                              <div key={i} className="py-0.5">{line}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-text-secondary">
              <RefreshCw className="w-8 h-8 mx-auto mb-3 text-text-tertiary" />
              <p>No update jobs yet</p>
              <p className="text-sm text-text-tertiary mt-1">Trigger your first update above</p>
            </div>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
