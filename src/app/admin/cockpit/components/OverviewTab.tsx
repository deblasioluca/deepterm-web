'use client';

import {
  Bug,
  Lightbulb,
  Package,
  Users,
  DollarSign,
  TrendingUp,
  CreditCard,
  Server,
  Cpu,
  Radio,
  Globe,
  GitBranch,
  Brain,
  Workflow,
} from 'lucide-react';
import type { QuickStats, RevenueData, HealthData, CiBuild } from '../types';
import { formatTimeAgo } from '../utils';
import { StatusBadge } from './shared';

interface OverviewTabProps {
  stats: QuickStats;
  revenue: RevenueData;
  health: HealthData;
  builds: CiBuild[];
}

export default function OverviewTab({ stats, revenue, health, builds }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Bug className="w-3.5 h-3.5" /> Issues
          </div>
          <div className="text-2xl font-bold text-white">{stats.issues.open}</div>
          <div className="text-xs text-zinc-500 mt-1">open of {stats.issues.total}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Lightbulb className="w-3.5 h-3.5" /> Ideas
          </div>
          <div className="text-2xl font-bold text-white">{stats.ideas}</div>
          <div className="text-xs text-zinc-500 mt-1">submitted</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Package className="w-3.5 h-3.5" /> Releases
          </div>
          <div className="text-2xl font-bold text-white">{stats.releases.total}</div>
          <div className="text-xs text-zinc-500 mt-1">latest: {stats.releases.latest}</div>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 text-xs mb-2">
            <Users className="w-3.5 h-3.5" /> Users
          </div>
          <div className="text-2xl font-bold text-white">{stats.users}</div>
          <div className="text-xs text-zinc-500 mt-1">registered</div>
        </div>
      </div>

      {/* Revenue */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-400" /> Revenue
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-xs text-zinc-500 mb-1">Pro Users</div>
            <div className="text-xl font-bold text-emerald-400">{revenue.proUsers}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-xs text-zinc-500 mb-1">Free Users</div>
            <div className="text-xl font-bold text-zinc-300">{revenue.freeUsers}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
            <div className="text-xs text-zinc-500 mb-1">Total Users</div>
            <div className="text-xl font-bold text-white">{revenue.totalUsers}</div>
          </div>
          <div className="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50">
            <div className="flex items-center gap-1 text-xs text-zinc-500 mb-1">
              <TrendingUp className="w-3 h-3" /> Conversion
            </div>
            <div className="text-xl font-bold text-amber-400">{revenue.conversionRate}%</div>
          </div>
        </div>

        {revenue.recentPayments?.length > 0 && (
          <div>
            <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">Recent Payment Events</h3>
            <div className="space-y-1.5">
              {revenue.recentPayments.map((payment) => (
                <div key={payment.id} className="flex items-center gap-3 p-2.5 bg-zinc-800/40 rounded-lg border border-zinc-700/30">
                  <CreditCard className={`w-4 h-4 ${
                    payment.event === 'payment-success' ? 'text-emerald-400' :
                    payment.event === 'payment-failed' ? 'text-red-400' : 'text-amber-400'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-zinc-200 truncate">
                      {payment.email}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {payment.details || payment.event}
                      {payment.amount ? ` · $${(payment.amount / 100).toFixed(2)}` : ''}
                    </div>
                  </div>
                  <span className="text-xs text-zinc-500">{formatTimeAgo(payment.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Compact System Health — All 7 Systems */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-zinc-300 mb-3 flex items-center gap-2">
          System Health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { icon: Server, color: "text-blue-400", name: "Pi", status: health?.pi?.status },
            { icon: Globe, color: "text-emerald-400", name: "Web App", status: health?.webApp?.status },
            { icon: Cpu, color: "text-purple-400", name: "CI Mac", status: health?.ciMac?.status },
            { icon: Radio, color: "text-amber-400", name: "Node-RED", status: health?.nodeRed?.status },
            { icon: GitBranch, color: "text-zinc-300", name: "GitHub", status: health?.github?.status },
            { icon: Brain, color: "text-cyan-400", name: "AI Dev", status: health?.aiDevMac?.status },
            { icon: Workflow, color: "text-orange-400", name: "Airflow", status: health?.airflow?.status },
          ].map((sys) => (
            <div key={sys.name} className="flex items-center gap-1.5 bg-zinc-800/40 rounded-lg px-2.5 py-2 border border-zinc-700/30">
              <sys.icon className={'w-3.5 h-3.5 ' + sys.color} />
              <span className="text-xs text-zinc-300">{sys.name}</span>
              <StatusBadge status={sys.status || "unknown"} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
