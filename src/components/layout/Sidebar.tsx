'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';
import {
  User,
  Users,
  Lock,
  Key,
  CreditCard,
  Lightbulb,
  Download,
  MessageSquare,
  Shield,
  HelpCircle,
  GraduationCap,
  LogOut,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Fingerprint,
} from 'lucide-react';
import { useState } from 'react';
import { useLocale } from '@/components/i18n/LocaleProvider';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';

export function Sidebar() {
  const { messages } = useLocale();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const sidebarLinks = [
    { label: messages.sidebar.account, href: '/dashboard', icon: User },
    { label: messages.sidebar.team, href: '/dashboard/team', icon: Users },
    { label: messages.sidebar.vaults, href: '/dashboard/vaults', icon: Lock },
    { label: messages.sidebar.samlSso, href: '/dashboard/sso', icon: Key },
    { label: messages.sidebar.twoFactorAuth, href: '/dashboard/2fa', icon: Smartphone },
    { label: messages.sidebar.passkeys, href: '/dashboard/passkeys', icon: Fingerprint },
    { label: messages.sidebar.billing, href: '/dashboard/billing', icon: CreditCard },
  ];

  const secondaryLinks = [
    { label: messages.sidebar.forStudents, href: '/dashboard/students', icon: GraduationCap },
    { label: messages.sidebar.ideas, href: '/dashboard/ideas', icon: Lightbulb },
    { label: messages.sidebar.getTheApp, href: '/dashboard/get-the-app', icon: Download },
    { label: messages.sidebar.issues, href: '/dashboard/issues', icon: MessageSquare },
    { label: messages.sidebar.securityAssessment, href: '/dashboard/security-assessment', icon: Shield },
    { label: messages.sidebar.helpFeedback, href: '/dashboard/help', icon: HelpCircle },
  ];

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-full bg-[#0D0D14] border-r border-border z-40 transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Terminal className="w-8 h-8 text-accent-primary" />
            {!isCollapsed && (
              <>
                <span className="text-lg font-bold text-text-primary">Deep</span>
                <span className="text-lg font-bold text-accent-secondary">Term</span>
              </>
            )}
          </Link>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 text-text-tertiary hover:text-text-primary hover:bg-background-tertiary rounded transition-colors"
            aria-label={isCollapsed ? messages.sidebar.expandSidebar : messages.sidebar.collapseSidebar}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {sidebarLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive
                        ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="text-sm font-medium">{link.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Divider */}
          <div className="my-4 mx-4 border-t border-border" />

          {!isCollapsed && (
            <div className="px-3 mb-4">
              <LanguageSelector className="w-full" />
            </div>
          )}

          {/* Secondary Navigation */}
          <ul className="space-y-1 px-2">
            {secondaryLinks.map((link) => {
              const isActive = pathname === link.href;
              const Icon = link.icon;

              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive
                        ? 'bg-accent-primary/10 text-accent-primary border-l-2 border-accent-primary'
                        : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary'
                    )}
                  >
                    <Icon className="w-5 h-5 flex-shrink-0" />
                    {!isCollapsed && <span className="text-sm font-medium">{link.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-border">
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-text-secondary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors'
            )}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">{messages.sidebar.logOut}</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
