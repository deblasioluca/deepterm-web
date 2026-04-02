'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Building2,
  CreditCard,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Shield,
  FileText,
  BarChart3,
  Bell,
  HelpCircle,
  MessageSquare,
  Loader2,
  Key,
  Activity,
  GitMerge,
  Database,
  Bot,
  Mail,
  AreaChart,
  RefreshCw,
} from 'lucide-react';

// Custom GitHub mark — the lucide `Github` icon is deprecated and barely visible
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
import { AdminAIProvider, useAdminAI } from '@/components/admin/AdminAIContext';
import AdminAIPanel from '@/components/admin/AdminAIPanel';

const navItems = [
  { label: 'Command Center', href: '/admin',            icon: LayoutDashboard },
  { label: 'Cockpit',      href: '/admin/cockpit',      icon: Activity },
  { label: 'DevOps',       href: '/admin/devops',       icon: GitMerge },
  { label: 'GitHub',       href: '/admin/github',       icon: GithubIcon },
  { label: 'Users',        href: '/admin/users',        icon: Users },
  { label: 'Vault',        href: '/admin/vault',        icon: Shield },
  { label: 'Organizations', href: '/admin/teams',        icon: Building2 },
  { label: 'Licenses',     href: '/admin/licenses',     icon: Key },
  { label: 'Subscriptions',href: '/admin/subscriptions',icon: CreditCard },
  { label: 'Analytics',    href: '/admin/analytics',    icon: BarChart3 },
  { label: 'Statistics',   href: '/admin/statistics',   icon: AreaChart },
  { label: 'Content Update',href: '/admin/content-update',icon: RefreshCw },
  { label: 'Audit Logs',   href: '/admin/audit-logs',   icon: FileText },
  { label: 'Feedback',     href: '/admin/feedback',     icon: MessageSquare },
  { label: 'Issues',       href: '/admin/issues',       icon: HelpCircle },
  { label: 'Email',        href: '/admin/email',        icon: Mail },
  { label: 'Announcements',href: '/admin/announcements',icon: Bell },
  { label: 'Settings',     href: '/admin/settings',     icon: Settings },
];

// ── Inner layout — can access AdminAIContext ──────────────────────────────────

function AdminLayoutInner({
  children,
  collapsed,
  setCollapsed,
  isAuthenticated,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  isAuthenticated: boolean | null;
}) {
  const pathname = usePathname();
  const { isPanelOpen, togglePanel } = useAdminAI();

  if (pathname === '/admin/login') return <>{children}</>;

  if (isAuthenticated === null || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary flex">
      {/* ── Sidebar ── */}
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? 72 : 260 }}
        className="fixed left-0 top-0 h-screen bg-background-secondary border-r border-border z-50 flex flex-col"
      >
        {/* Logo */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <AnimatePresence mode="wait">
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-lg flex items-center justify-center">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <span className="font-bold text-text-primary">Admin Panel</span>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-2 rounded-lg hover:bg-background-tertiary text-text-secondary hover:text-text-primary transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/admin' && pathname.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group ${
                  isActive
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
                }`}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-accent-primary' : ''}`} />
                <AnimatePresence mode="wait">
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-1">
          {/* AI Assistant toggle */}
          <button
            onClick={togglePanel}
            title={isPanelOpen ? 'Close AI Assistant (Cmd+Shift+A)' : 'Open AI Assistant (Cmd+Shift+A)'}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
              isPanelOpen
                ? 'bg-accent-primary/20 text-accent-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
            }`}
          >
            <Bot className={`w-5 h-5 flex-shrink-0 ${isPanelOpen ? 'text-accent-primary' : ''}`} />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium"
                >
                  AI Assistant
                </motion.span>
              )}
            </AnimatePresence>
          </button>

          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-all"
          >
            <HelpCircle className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium"
                >
                  Back to App
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          <button
            onClick={async () => {
              await fetch('/api/admin/auth/logout', { method: 'POST' });
              window.location.href = '/admin/login';
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-text-secondary hover:text-accent-danger hover:bg-accent-danger/10 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <AnimatePresence mode="wait">
              {!collapsed && (
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-sm font-medium"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* ── Main Content ── */}
      <main
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'ml-[72px]' : 'ml-[260px]'
        } ${isPanelOpen ? 'mr-[380px]' : ''}`}
      >
        <div className="p-8">{children}</div>
      </main>

      {/* ── AI Panel ── */}
      <AdminAIPanel />
    </div>
  );
}

// ── Outer layout — manages auth state, wraps Provider ────────────────────────

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const pathname = usePathname();
  const buildIdRef = useRef<string | null>(null);

  // Detect stale deployment and force a full reload when the server has been rebuilt
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const fetchBuildId = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return null;
        const data = await res.json() as { buildId: string };
        return data.buildId ?? null;
      } catch {
        return null;
      }
    };

    fetchBuildId().then((id) => { if (id) buildIdRef.current = id; });

    const interval = setInterval(async () => {
      const id = await fetchBuildId();
      if (id && buildIdRef.current && id !== buildIdRef.current) {
        window.location.reload();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  // Check authentication on mount and route changes
  useEffect(() => {
    if (pathname === '/admin/login') {
      setIsAuthenticated(false);
      return;
    }

    const checkAuth = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch('/api/admin/auth/check', {
          signal: controller.signal,
          cache: 'no-store',
        });
        clearTimeout(timeoutId);
        if (response.ok) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
          window.location.href = '/admin/login';
        }
      } catch {
        clearTimeout(timeoutId);
        setIsAuthenticated(false);
        window.location.href = '/admin/login';
      }
    };

    void checkAuth();
  }, [pathname]);

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  return (
    <AdminAIProvider>
      <AdminLayoutInner
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        isAuthenticated={isAuthenticated}
      >
        {children}
      </AdminLayoutInner>
    </AdminAIProvider>
  );
}
