'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import DevLifecycleFlow, { StoryLifecycleData } from './DevLifecycleFlow';

export default function LifecycleTab() {
  const [stories, setStories] = useState<StoryLifecycleData[]>([]);
  const [selectedStory, setSelectedStory] = useState<StoryLifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/cockpit/lifecycle');
      const data = await res.json();
      if (data.stories) {
        setStories(data.stories);
        if (!selectedStory && data.stories.length > 0) {
          setSelectedStory(data.stories[0]);
        } else if (selectedStory) {
          const updated = data.stories.find((s: StoryLifecycleData) => s.id === selectedStory.id);
          if (updated) setSelectedStory(updated);
        }
      }
    } catch (err) {
      console.error('Failed to fetch lifecycle data:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStory]);

  useEffect(() => { fetchData(); }, []);

  // Auto-refresh every 15s for active stories
  useEffect(() => {
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSelectStory = (id: string) => {
    const found = stories.find(s => s.id === id);
    if (found) setSelectedStory(found);
  };

  const handleGateAction = async (stepId: string, action: string, storyId?: string) => {
    if (!storyId) return;
    setActionLoading(`${stepId}-${action}`);
    try {
      // Route gate actions to appropriate endpoints
      const actionMap: Record<string, { url: string; method: string; body?: object }> = {
        'start-deliberation': {
          url: '/api/admin/cockpit/deliberation',
          method: 'POST',
          body: { storyId, title: selectedStory?.title || 'Review' },
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
        'deploy-release': {
          url: '/api/admin/cockpit/actions',
          method: 'POST',
          body: { action: 'deploy-release', storyId },
        },
      };

      const mapped = actionMap[action];
      if (mapped) {
        const res = await fetch(mapped.url, {
          method: mapped.method,
          headers: { 'Content-Type': 'application/json' },
          body: mapped.body ? JSON.stringify(mapped.body) : undefined,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('Gate action failed:', err);
        }
      }

      // Refresh data
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

  return (
    <div className="space-y-4">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Tracking {stories.length} active {stories.length === 1 ? 'story' : 'stories'} through the development pipeline
        </p>
        <button
          onClick={() => { setLoading(true); fetchData(); }}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition"
          title="Refresh"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Lifecycle flow */}
      <DevLifecycleFlow
        story={selectedStory}
        stories={stories}
        onGateAction={handleGateAction}
        onSelectStory={handleSelectStory}
      />
    </div>
  );
}
