'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, ChevronDown, Terminal } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useLocale } from '@/components/i18n/LocaleProvider';
import { LanguageSelector } from '@/components/i18n/LanguageSelector';

export function Navbar() {
  const { messages } = useLocale();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const navLinks = [
    {
      label: messages.navbar.product,
      href: '/product',
      hasDropdown: true,
      dropdownItems: [
        { label: messages.navbar.overview, href: '/product' },
        { label: messages.navbar.features, href: '/product#features' },
        { label: messages.navbar.integrations, href: '/product#integrations' },
        { label: messages.navbar.changelog, href: '/product#changelog' },
      ],
    },
    { label: messages.navbar.security, href: '/security' },
    { label: messages.navbar.pricing, href: '/pricing' },
    { label: messages.navbar.enterprise, href: '/enterprise' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        isScrolled
          ? 'bg-background-primary/80 backdrop-blur-nav border-b border-border'
          : 'bg-transparent'
      )}
    >
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Terminal className="w-8 h-8 text-accent-primary" />
            <span className="text-xl font-bold text-text-primary">Deep</span>
            <span className="text-xl font-bold text-accent-secondary">Term</span>
            <motion.span
              animate={{ opacity: [1, 0, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
              className="w-2 h-5 bg-accent-secondary inline-block ml-0.5"
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <div
                key={link.label}
                className="relative"
                onMouseEnter={() => link.hasDropdown && setActiveDropdown(link.label)}
                onMouseLeave={() => setActiveDropdown(null)}
              >
                <Link
                  href={link.href}
                  className="flex items-center gap-1 text-text-secondary hover:text-text-primary transition-colors"
                >
                  {link.label}
                  {link.hasDropdown && <ChevronDown className="w-4 h-4" />}
                </Link>

                {/* Dropdown */}
                <AnimatePresence>
                  {link.hasDropdown && activeDropdown === link.label && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      transition={{ duration: 0.2 }}
                      className="absolute top-full left-0 mt-2 w-48 bg-background-secondary border border-border rounded-lg shadow-xl overflow-hidden"
                    >
                      {link.dropdownItems?.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="block px-4 py-2.5 text-sm text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">{messages.navbar.login}</Button>
            </Link>
            <LanguageSelector className="flex-shrink-0" />
            <Link href="/register">
              <Button variant="primary">{messages.navbar.register}</Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-text-primary"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label={messages.navbar.toggleMenu}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden border-t border-border"
            >
              <div className="py-4 space-y-2">
                {navLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className="block px-4 py-2 text-text-secondary hover:text-text-primary hover:bg-background-tertiary rounded-lg transition-colors"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="px-4 pt-2">
                  <LanguageSelector className="w-full" />
                </div>
                <div className="pt-4 px-4 space-y-2">
                  <Link href="/login" className="block">
                    <Button variant="ghost" className="w-full">
                      {messages.navbar.login}
                    </Button>
                  </Link>
                  <Link href="/register" className="block">
                    <Button variant="primary" className="w-full">
                      {messages.navbar.register}
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  );
}
