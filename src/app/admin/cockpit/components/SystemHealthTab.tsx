'use client';

import { Activity, Server, Cpu, Radio } from 'lucide-react';
import type { HealthData, CiBuild } from '../types';
import { formatUptime, formatTimeAgo } from '../utils';
import { StatusBadge } from './shared';

interface SystemHealthTabProps {
  health: HealthData;
  builds: CiBuild[];
}

export default function SystemHealthTab({ health, builds }: SystemHealthTabProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" /> System Health
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pi */}
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-zinc-200">Raspberry Pi</span>
            </div>
            <StatusBadge status={health?.pi?.status || "unknown"} />
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between">
              <span>Uptime</span>
              <span className="text-zinc-300">{formatUptime(health?.pi?.uptimeSeconds || 0)}</span>
            </div>
            <div className="flex justify-between">
              <span>Memory (RSS)</span>
              <span className="text-zinc-300">{health?.pi?.memoryMB || 0} MB</span>
            </div>
            <div className="flex justify-between">
              <span>Heap Used</span>
              <span className="text-zinc-300">{health?.pi?.heapMB || 0} MB</span>
            </div>
          </div>
        </div>

        {/* CI Mac */}
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-zinc-200">CI Mac</span>
            </div>
            <StatusBadge status={health?.ciMac?.status || "unknown"} />
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between">
              <span>Runner</span>
              <span className="text-zinc-300">self-hosted-mac</span>
            </div>
            <div className="flex justify-between">
              <span>Last build</span>
              <span className="text-zinc-300">
                {builds.length > 0 ? formatTimeAgo(builds[0].createdAt) : 'none'}
              </span>
            </div>
          </div>
        </div>

        {/* Node-RED */}
        <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-medium text-zinc-200">Node-RED</span>
            </div>
            <StatusBadge status={health?.nodeRed?.status || "unknown"} />
          </div>
          <div className="space-y-1.5 text-xs text-zinc-400">
            <div className="flex justify-between">
              <span>Address</span>
              <span className="text-zinc-300">192.168.1.30:1880</span>
            </div>
            <div className="flex justify-between">
              <span>Flows</span>
              <span className="text-zinc-300">WhatsApp + DeepTerm</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
