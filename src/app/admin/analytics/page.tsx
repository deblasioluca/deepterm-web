'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Users,
  Building2,
  CreditCard,
  DollarSign,
  Loader2,
  Shield,
  Key,
  Bug,
  CheckCircle2,
  UserPlus,
} from 'lucide-react';
import { useAdminAI } from '@/components/admin/AdminAIContext';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalTeams: number;
    totalRevenue: number;
    activeSubscriptions: number;
    newUsersInPeriod: number;
    newTeamsInPeriod: number;
  };
  vault: {
    totalUsers: number;
    activeUsers: number;
    totalItems: number;
    deletedItems: number;
    totalVaults: number;
  };
  issues: {
    open: number;
    resolvedInPeriod: number;
  };
  userGrowth: { date: string; count: number }[];
  revenueGrowth: { date: string; amount: number }[];
  planDistribution: { plan: string; count: number }[];
  topTeams: { name: string; members: number; plan: string }[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  const { setPageContext } = useAdminAI();
  useEffect(() => {
    setPageContext({
      page: 'Analytics',
      summary: `Platform analytics for ${period}`,
      data: { period, overview: data?.overview ?? null, vault: data?.vault ?? null },
    });
    return () => setPageContext(null);
  }, [data, period, setPageContext]);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/admin/analytics?period=${period}`);
        if (res.ok) setData(await res.json());
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [period]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-accent-primary animate-spin" />
      </div>
    );
  }

  const o = data?.overview;
  const v = data?.vault;

  return (
    <div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Analytics</h1>
            <p className="text-text-secondary">Platform metrics and insights</p>
          </div>
          <div className="flex bg-background-tertiary rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${period === p ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary'}`}>
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Platform Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard icon={Users} color="blue" label="Total Users" value={o?.totalUsers ?? 0} sub={`+${o?.newUsersInPeriod ?? 0} this period`} />
          <StatCard icon={Building2} color="purple" label="Teams" value={o?.totalTeams ?? 0} sub={`+${o?.newTeamsInPeriod ?? 0} this period`} />
          <StatCard icon={CreditCard} color="green" label="Active Subs" value={o?.activeSubscriptions ?? 0} />
          <StatCard icon={DollarSign} color="amber" label="MRR" value={`$${((o?.totalRevenue ?? 0) / 100).toLocaleString()}`} />
        </div>

        {/* Vault + Issue Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatCard icon={Shield} color="accent" label="Vault Users" value={v?.totalUsers ?? 0} sub={`${v?.activeUsers ?? 0} active`} />
          <StatCard icon={Key} color="teal" label="Vault Items" value={v?.totalItems ?? 0} sub={`${v?.deletedItems ?? 0} deleted`} />
          <StatCard icon={Shield} color="purple" label="Vaults" value={v?.totalVaults ?? 0} />
          <StatCard icon={Bug} color="red" label="Open Issues" value={data?.issues.open ?? 0} />
          <StatCard icon={CheckCircle2} color="green" label="Resolved" value={data?.issues.resolvedInPeriod ?? 0} sub="this period" />
        </div>

        {/* Charts */}
        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">User Growth</h2>
            <BarChart data={data?.userGrowth ?? []} valueKey="count" color="accent-primary" format={(v) => `${v} users`} />
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Revenue</h2>
            <BarChart data={data?.revenueGrowth ?? []} valueKey="amount" color="green-500" format={(v) => `$${(v / 100).toFixed(2)}`} />
          </Card>
        </div>

        {/* Plan Distribution + Top Teams */}
        <div className="grid lg:grid-cols-2 gap-6">
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Plan Distribution</h2>
            <div className="space-y-4">
              {data?.planDistribution?.map((item) => {
                const total = data.planDistribution.reduce((s, p) => s + p.count, 0);
                const pct = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.plan}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.plan}</Badge>
                        <span className="text-text-secondary">{item.count} teams</span>
                      </div>
                      <span className="text-text-primary font-medium">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                      <div className="h-full bg-accent-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              }) || <p className="text-text-secondary text-center py-8">No data</p>}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Top Teams</h2>
            <div className="space-y-4">
              {data?.topTeams?.map((team, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent-primary/20 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-accent-primary">{i + 1}</span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{team.name}</p>
                      <p className="text-sm text-text-secondary">{team.members} members</p>
                    </div>
                  </div>
                  <Badge variant="primary">{team.plan}</Badge>
                </div>
              )) || <p className="text-text-secondary text-center py-8">No data</p>}
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 bg-${color}-500/10 rounded-xl`}>
          <Icon className={`w-5 h-5 text-${color}-500`} />
        </div>
        <div>
          <p className="text-xs text-text-secondary">{label}</p>
          <p className="text-xl font-bold text-text-primary">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {sub && <p className="text-[11px] text-text-tertiary">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function BarChart({ data, valueKey, color, format }: {
  data: Array<Record<string, unknown>>;
  valueKey: string;
  color: string;
  format: (v: number) => string;
}) {
  if (!data.length) return <div className="h-64 flex items-center justify-center text-text-secondary">No data available</div>;
  const max = Math.max(...data.map((d) => (d[valueKey] as number) || 0));
  return (
    <>
      <div className="h-64 flex items-end gap-2">
        {data.map((item, i) => {
          const val = (item[valueKey] as number) || 0;
          return (
            <div key={i} className={`flex-1 bg-${color}/20 rounded-t-lg transition-all hover:bg-${color}/40 relative group`}
              style={{ height: `${Math.max(max > 0 ? (val / max) * 100 : 0, 5)}%` }}>
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-background-tertiary px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {format(val)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-4 text-xs text-text-tertiary">
        <span>{data[0]?.date as string}</span>
        <span>{data[data.length - 1]?.date as string}</span>
      </div>
    </>
  );
}
