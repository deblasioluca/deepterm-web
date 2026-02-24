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
} from 'lucide-react';

const navItems = [
  {
    label: 'Overview',
    href: '/admin',
    icon: LayoutDashboard,
  },
  {
    label: 'Users',
    href: '/admin/users',
    icon: Users,
  },
  {
    label: 'Teams',
    href: '/admin/teams',
    icon: Building2,
  },
  {
    label: 'Licenses',
    href: '/admin/licenses',
    icon: Key,
  },
  {
    label: 'Subscriptions',
    href: '/admin/subscriptions',
    icon: CreditCard,
  },
  {
    label: 'Analytics',
    href: '/admin/analytics',
    icon: BarChart3,
  },
  {
    label: 'Audit Logs',
    href: '/admin/audit-logs',
    icon: FileText,
  },
  {
    label: 'Feedback',
    href: '/admin/feedback',
    icon: MessageSquare,
  },
  {
    label: 'Issues',
    href: '/admin/issues',
    icon: HelpCircle,
  },
  {
    label: 'Announcements',
    href: '/admin/announcements',
    icon: Bell,
  },
  {
    label: 'Settings',
    href: '/admin/settings',
    icon: Settings,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

    fetchBuildId().then((id) => {
      if (id) buildIdRef.current = id;
    });

    const interval = setInterval(async () => {
      const id = await fetchBuildId();
      if (id && buildIdRef.current && id !== buildIdRef.current) {
        // Server restarted with a new build — reload so JS stays in sync
        window.location.reload();
      }
    }, 60_000); // check every 60 s

    return () => clearInterval(interval);
  }, []);

  // Check authentication on mount and route changes
  useEffect(() => {
    // Skip auth check for login page
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
          // Use full-page navigation so a stale JS build cannot silently drop the redirect
          window.location.href = '/admin/login';
        }
      } catch {
        clearTimeout(timeoutId);
        setIsAuthenticated(false);
        window.location.href = '/admin/login';
      }
    };

    checkAuth();
  }, [pathname]);

  // Show login page without sidebar
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  // Show loading while checking auth
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  // Not authenticated - will redirect
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background-primary flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-primary flex">
      {/* Sidebar */}
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
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
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

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'ml-[72px]' : 'ml-[260px]'
        }`}
      >
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
