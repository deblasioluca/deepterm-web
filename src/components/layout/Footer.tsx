 'use client';

import Link from 'next/link';
import { Terminal, Github, Twitter, Linkedin } from 'lucide-react';
import { useLocale } from '@/components/i18n/LocaleProvider';

export function Footer() {
  const { messages } = useLocale();

  const footerLinks = {
    product: [
      { label: messages.navbar.features, href: '/product#features' },
      { label: messages.navbar.security, href: '/security' },
      { label: messages.navbar.pricing, href: '/pricing' },
      { label: messages.navbar.enterprise, href: '/enterprise' },
      { label: messages.footer.download, href: '/dashboard/get-the-app' },
    ],
    resources: [
      { label: messages.footer.documentation, href: '#' },
      { label: messages.footer.blog, href: '#' },
      { label: messages.footer.helpCenter, href: '#' },
      { label: messages.footer.systemStatus, href: '#' },
      { label: messages.navbar.changelog, href: '#' },
    ],
    company: [
      { label: messages.footer.aboutUs, href: '#' },
      { label: messages.footer.careers, href: '#' },
      { label: messages.footer.contact, href: '#' },
    ],
    legal: [
      { label: messages.footer.termsOfUse, href: '#' },
      { label: messages.footer.privacy, href: '#' },
      { label: messages.navbar.security, href: '/security' },
    ],
  };

  return (
    <footer className="bg-background-secondary border-t border-border">
      <div className="max-w-content mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Terminal className="w-8 h-8 text-accent-primary" />
              <span className="text-xl font-bold text-text-primary">DeepTerm</span>
            </Link>
            <p className="text-text-secondary text-sm mb-6">
              {messages.footer.tagline}
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="text-text-tertiary hover:text-text-primary transition-colors"
                aria-label="GitHub"
              >
                <Github className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-text-tertiary hover:text-text-primary transition-colors"
                aria-label="Twitter"
              >
                <Twitter className="w-5 h-5" />
              </a>
              <a
                href="#"
                className="text-text-tertiary hover:text-text-primary transition-colors"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">{messages.footer.product}</h3>
            <ul className="space-y-3">
              {footerLinks.product.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">{messages.footer.resources}</h3>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company Links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">{messages.footer.company}</h3>
            <ul className="space-y-3">
              {footerLinks.company.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">{messages.footer.legal}</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-text-secondary hover:text-text-primary transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div className="mt-12 pt-8 border-t border-border">
          <p className="text-sm text-text-tertiary text-center">
            © {new Date().getFullYear()} DeepTerm. {messages.footer.rightsReserved}
          </p>
        </div>
      </div>
    </footer>
  );
}
