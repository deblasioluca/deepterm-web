'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  BarChart3,
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  Loader2,
} from 'lucide-react';

interface AnalyticsData {
  overview: {
    totalUsers: number;
    totalTeams: number;
    totalRevenue: number;
    activeSubscriptions: number;
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

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/admin/analytics?period=${period}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setIsLoading(false);
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
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary mb-2">Analytics</h1>
            <p className="text-text-secondary">Platform metrics and insights</p>
          </div>
          <div className="flex bg-background-tertiary rounded-lg p-1">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-accent-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total Users</p>
                <p className="text-2xl font-bold text-text-primary">
                  {data?.overview.totalUsers.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl">
                <Building2 className="w-6 h-6 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total Teams</p>
                <p className="text-2xl font-bold text-text-primary">
                  {data?.overview.totalTeams.toLocaleString() || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-xl">
                <CreditCard className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Active Subscriptions</p>
                <p className="text-2xl font-bold text-text-primary">
                  {data?.overview.activeSubscriptions || 0}
                </p>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-xl">
                <DollarSign className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-text-secondary">Total Revenue</p>
                <p className="text-2xl font-bold text-text-primary">
                  ${((data?.overview.totalRevenue || 0) / 100).toLocaleString()}
                </p>
              </div>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-8">
          {/* User Growth Chart */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">User Growth</h2>
            <div className="h-64 flex items-end gap-2">
              {data?.userGrowth?.map((item, index) => (
                <div
                  key={index}
                  className="flex-1 bg-accent-primary/20 rounded-t-lg transition-all hover:bg-accent-primary/40 relative group"
                  style={{
                    height: `${Math.max((item.count / Math.max(...data.userGrowth.map((d) => d.count))) * 100, 5)}%`,
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-background-tertiary px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {item.count} users
                  </div>
                </div>
              )) || (
                <div className="flex-1 flex items-center justify-center text-text-secondary">
                  No data available
                </div>
              )}
            </div>
            <div className="flex justify-between mt-4 text-xs text-text-tertiary">
              <span>{data?.userGrowth?.[0]?.date}</span>
              <span>{data?.userGrowth?.[data.userGrowth.length - 1]?.date}</span>
            </div>
          </Card>

          {/* Revenue Chart */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Revenue</h2>
            <div className="h-64 flex items-end gap-2">
              {data?.revenueGrowth?.map((item, index) => (
                <div
                  key={index}
                  className="flex-1 bg-green-500/20 rounded-t-lg transition-all hover:bg-green-500/40 relative group"
                  style={{
                    height: `${Math.max((item.amount / Math.max(...data.revenueGrowth.map((d) => d.amount))) * 100, 5)}%`,
                  }}
                >
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-background-tertiary px-2 py-1 rounded text-xs text-text-primary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    ${(item.amount / 100).toFixed(2)}
                  </div>
                </div>
              )) || (
                <div className="flex-1 flex items-center justify-center text-text-secondary">
                  No data available
                </div>
              )}
            </div>
            <div className="flex justify-between mt-4 text-xs text-text-tertiary">
              <span>{data?.revenueGrowth?.[0]?.date}</span>
              <span>{data?.revenueGrowth?.[data.revenueGrowth.length - 1]?.date}</span>
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Plan Distribution */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Plan Distribution</h2>
            <div className="space-y-4">
              {data?.planDistribution?.map((item) => {
                const total = data.planDistribution.reduce((sum, p) => sum + p.count, 0);
                const percentage = total > 0 ? (item.count / total) * 100 : 0;
                return (
                  <div key={item.plan}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{item.plan}</Badge>
                        <span className="text-text-secondary">{item.count} teams</span>
                      </div>
                      <span className="text-text-primary font-medium">
                        {percentage.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-background-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent-primary rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              }) || (
                <p className="text-text-secondary text-center py-8">No data available</p>
              )}
            </div>
          </Card>

          {/* Top Teams */}
          <Card>
            <h2 className="text-lg font-semibold text-text-primary mb-6">Top Teams</h2>
            <div className="space-y-4">
              {data?.topTeams?.map((team, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-background-tertiary rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-accent-primary/20 rounded-lg flex items-center justify-center">
                      <span className="text-sm font-bold text-accent-primary">
                        {index + 1}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-text-primary">{team.name}</p>
                      <p className="text-sm text-text-secondary">{team.members} members</p>
                    </div>
                  </div>
                  <Badge variant="primary">{team.plan}</Badge>
                </div>
              )) || (
                <p className="text-text-secondary text-center py-8">No data available</p>
              )}
            </div>
          </Card>
        </div>
      </motion.div>
    </div>
  );
}
