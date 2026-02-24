'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, Badge } from '@/components/ui';
import {
  Users,
  Building2,
  CreditCard,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  totalUsers: number;
  userGrowth: number;
  totalTeams: number;
  teamGrowth: number;
  activeSubscriptions: number;
  subscriptionGrowth: number;
  mrr: number;
  mrrGrowth: number;
  recentUsers: Array<{
    id: string;
    name: string;
    email: string;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    createdAt: string;
  }>;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await fetch('/api/admin/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Users',
      value: stats?.totalUsers || 0,
      change: stats?.userGrowth || 0,
      icon: Users,
      href: '/admin/users',
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
    },
    {
      title: 'Teams',
      value: stats?.totalTeams || 0,
      change: stats?.teamGrowth || 0,
      icon: Building2,
      href: '/admin/teams',
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
    },
    {
      title: 'Active Subscriptions',
      value: stats?.activeSubscriptions || 0,
      change: stats?.subscriptionGrowth || 0,
      icon: CreditCard,
      href: '/admin/subscriptions',
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
    },
    {
      title: 'Monthly Revenue',
      value: `$${((stats?.mrr || 0) / 100).toLocaleString()}`,
      change: stats?.mrrGrowth || 0,
      icon: DollarSign,
      href: '/admin/analytics',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      isCurrency: true,
    },
  ];

  return (
    <div>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Admin Dashboard
          </h1>
          <p className="text-text-secondary">
            Overview of your platform metrics and activity
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            const isPositive = stat.change >= 0;

            return (
              <motion.div
                key={stat.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={stat.href}>
                  <Card hover className="relative overflow-hidden">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-text-secondary mb-1">
                          {stat.title}
                        </p>
                        <p className="text-2xl font-bold text-text-primary">
                          {isLoading ? '...' : stat.value}
                        </p>
                        <div className="flex items-center gap-1 mt-2">
                          {isPositive ? (
                            <ArrowUpRight className="w-4 h-4 text-green-500" />
                          ) : (
                            <ArrowDownRight className="w-4 h-4 text-red-500" />
                          )}
                          <span
                            className={`text-sm font-medium ${
                              isPositive ? 'text-green-500' : 'text-red-500'
                            }`}
                          >
                            {Math.abs(stat.change)}%
                          </span>
                          <span className="text-xs text-text-tertiary">
                            vs last month
                          </span>
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                        <Icon className={`w-6 h-6 ${stat.color}`} />
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Recent Users */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary">
                Recent Users
              </h2>
              <Link
                href="/admin/users"
                className="text-sm text-accent-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Activity className="w-6 h-6 text-accent-primary animate-pulse" />
                </div>
              ) : stats?.recentUsers?.length ? (
                stats.recentUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-accent-primary/20 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-accent-primary">
                          {user.name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-text-primary">
                          {user.name}
                        </p>
                        <p className="text-sm text-text-secondary">{user.email}</p>
                      </div>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-text-secondary py-8">
                  No recent users
                </p>
              )}
            </div>
          </Card>

          {/* Recent Activity */}
          <Card>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-text-primary">
                Recent Activity
              </h2>
              <Link
                href="/admin/audit-logs"
                className="text-sm text-accent-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Activity className="w-6 h-6 text-accent-primary animate-pulse" />
                </div>
              ) : stats?.recentActivity?.length ? (
                stats.recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-background-tertiary"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-accent-primary rounded-full" />
                      <div>
                        <p className="font-medium text-text-primary">
                          {activity.action}
                        </p>
                        <p className="text-sm text-text-secondary">
                          {activity.entityType}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-text-tertiary">
                      {new Date(activity.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-center text-text-secondary py-8">
                  No recent activity
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-text-primary mb-4">
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Link href="/admin/users?action=create">
              <Card hover className="text-center py-6">
                <Users className="w-8 h-8 text-accent-primary mx-auto mb-2" />
                <p className="font-medium text-text-primary">Add User</p>
              </Card>
            </Link>
            <Link href="/admin/teams?action=create">
              <Card hover className="text-center py-6">
                <Building2 className="w-8 h-8 text-purple-500 mx-auto mb-2" />
                <p className="font-medium text-text-primary">Create Team</p>
              </Card>
            </Link>
            <Link href="/admin/announcements?action=create">
              <Card hover className="text-center py-6">
                <TrendingUp className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium text-text-primary">New Announcement</p>
              </Card>
            </Link>
            <Link href="/admin/settings">
              <Card hover className="text-center py-6">
                <MoreHorizontal className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-medium text-text-primary">Settings</p>
              </Card>
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
