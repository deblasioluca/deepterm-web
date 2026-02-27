'use client';

import { useState } from 'react';
import { Eye, GitPullRequest, GitBranch } from 'lucide-react';
import ReviewsTab from '../../cockpit/components/ReviewsTab';
import PullRequestsTab from '../../cockpit/components/PullRequestsTab';
import GithubActivityTab from '../../cockpit/components/GithubActivityTab';

const SUB_TABS = [
  { key: 'reviews', label: 'Reviews', icon: Eye },
  { key: 'pulls', label: 'Pull Requests', icon: GitPullRequest },
  { key: 'activity', label: 'Activity', icon: GitBranch },
] as const;

type SubTabKey = typeof SUB_TABS[number]['key'];

export default function CodeAndPRsTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTabKey>('reviews');
  const [activityEvents, setActivityEvents] = useState<any[]>([]);
  const [activityLoaded, setActivityLoaded] = useState(false);

  // Lazy load activity data
  if (activeSubTab === 'activity' && !activityLoaded) {
    fetch('/api/admin/cockpit/tab/activity')
      .then(r => r.ok ? r.json() : { events: [] })
      .then(d => { setActivityEvents(d.events || []); setActivityLoaded(true); })
      .catch(() => setActivityLoaded(true));
  }

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 border-b border-zinc-800 pb-2">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.key;
          return (
            <button key={tab.key} onClick={() => setActiveSubTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                isActive ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'reviews' && <ReviewsTab onDataChange={() => {}} />}
      {activeSubTab === 'pulls' && <PullRequestsTab />}
      {activeSubTab === 'activity' && <GithubActivityTab events={activityEvents} />}
    </div>
  );
}
