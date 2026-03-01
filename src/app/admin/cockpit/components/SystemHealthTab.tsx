'use client';

import { Activity, Server, Cpu, Radio, Globe, GitBranch, Brain, Workflow } from 'lucide-react';
import type { HealthData, CiBuild } from '../types';
import { formatUptime, formatTimeAgo } from '../utils';
import { StatusBadge } from './shared';

interface SystemHealthTabProps {
  health: HealthData;
  builds: CiBuild[];
}

function SystemCard({ icon: Icon, iconColor, name, status, children }: {
  icon: any; iconColor: string; name: string; status: string; children: React.ReactNode;
}) {
  return (
    <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-sm font-medium text-zinc-200">{name}</span>
        </div>
        <StatusBadge status={status} />
      </div>
      <div className="space-y-1.5 text-xs text-zinc-400">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-zinc-300">{value}</span>
    </div>
  );
}

export default function SystemHealthTab({ health, builds }: SystemHealthTabProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
        <Activity className="w-4 h-4 text-emerald-400" /> System Health — 7 Systems
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

        {/* Raspberry Pi */}
        <SystemCard icon={Server} iconColor="text-blue-400" name="Raspberry Pi" status={health?.pi?.status || "unknown"}>
          <Row label="OS Uptime" value={health?.pi?.osUptimeSeconds ? formatUptime(health.pi.osUptimeSeconds) : "—"} />
          <Row label="Disk" value={health?.pi?.diskUsed && health?.pi?.diskTotal ? `${health.pi.diskUsed} / ${health.pi.diskTotal} (${health.pi.diskPercent})` : "—"} />
          <Row label="Temp" value={health?.pi?.tempC ? `${health.pi.tempC}°C` : "—"} />
        </SystemCard>

        {/* Web App */}
        <SystemCard icon={Globe} iconColor="text-emerald-400" name="Web App (Next.js)" status={health?.webApp?.status || "unknown"}>
          <Row label="Process Uptime" value={formatUptime(health?.webApp?.uptimeSeconds || 0)} />
          <Row label="Memory (RSS)" value={`${health?.webApp?.memoryMB || 0} MB`} />
          <Row label="Heap Used" value={`${health?.webApp?.heapMB || 0} MB`} />
          <Row label="Node" value={health?.webApp?.nodeVersion || "—"} />
        </SystemCard>

        {/* CI Mac */}
        <SystemCard icon={Cpu} iconColor="text-purple-400" name="CI Mac" status={health?.ciMac?.status || "unknown"}>
          <Row label="Runner" value={health?.ciMac?.runnerName || "self-hosted-mac"} />
          <Row label="Last Build" value={builds.length > 0 ? formatTimeAgo(builds[0].createdAt) : "none"} />
          <Row label="Recent Builds" value={`${builds.length} shown`} />
        </SystemCard>

        {/* Node-RED */}
        <SystemCard icon={Radio} iconColor="text-amber-400" name="Node-RED" status={health?.nodeRed?.status || "unknown"}>
          <Row label="Address" value={health?.addresses?.nodeRed || "192.168.1.30:1880"} />
          <Row label="Flows" value="WhatsApp + DeepTerm" />
        </SystemCard>

        {/* GitHub */}
        <SystemCard icon={GitBranch} iconColor="text-zinc-300" name="GitHub" status={health?.github?.status || "unknown"}>
          <Row label="API Rate Limit" value={health?.github?.rateLimit ? `${health.github.rateRemaining} / ${health.github.rateLimit}` : "—"} />
          <Row label="Repos" value="deepterm, deepterm-web" />
        </SystemCard>

        {/* AI Dev Mac */}
        <SystemCard icon={Brain} iconColor="text-cyan-400" name="AI Dev Mac" status={health?.aiDevMac?.status || "unknown"}>
          <Row label="Address" value={health?.addresses?.aiDevMac || "unknown"} />
          <Row label="Detail" value={health?.aiDevMac?.detail || "—"} />
        </SystemCard>

        {/* Airflow */}
        <SystemCard icon={Workflow} iconColor="text-orange-400" name="Airflow" status={health?.airflow?.status || "unknown"}>
          <Row label="Address" value={health?.addresses?.airflow || "unknown"} />
          <Row label="Status" value={health?.airflow?.status === "online" ? "Scheduler healthy" : health?.airflow?.status || "—"} />
        </SystemCard>

      </div>
    </div>
  );
}
