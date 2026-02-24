'use client';

import { useState, useMemo, useCallback, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Terminal,
  Search,
  ChevronRight,
  Menu,
  X,
  ArrowLeft,
  ExternalLink,
} from 'lucide-react';
import { DOC_CATEGORIES, findArticle, getDefaultArticle, getAllArticles, type DocArticle } from './docs-data';

// ── Sidebar ────────────────────────────────────────────────

function Sidebar({
  activeSlug,
  onNavigate,
  className = '',
}: {
  activeSlug: string;
  onNavigate: (slug: string) => void;
  className?: string;
}) {
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => {
    // Open the category containing the active article by default
    const all = new Set<string>();
    for (const cat of DOC_CATEGORIES) {
      if (cat.articles.some(a => a.slug === activeSlug)) {
        all.add(cat.label);
      }
    }
    // Always open Getting Started
    all.add('Getting Started');
    return all;
  });

  const toggle = (label: string) => {
    setOpenCategories(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  // When active article changes, make sure its category is open
  useEffect(() => {
    for (const cat of DOC_CATEGORIES) {
      if (cat.articles.some(a => a.slug === activeSlug)) {
        setOpenCategories(prev => {
          if (prev.has(cat.label)) return prev;
          const next = new Set(prev);
          next.add(cat.label);
          return next;
        });
      }
    }
  }, [activeSlug]);

  return (
    <nav className={`space-y-1 ${className}`}>
      {DOC_CATEGORIES.map(cat => {
        const Icon = cat.icon;
        const isOpen = openCategories.has(cat.label);
        const hasActive = cat.articles.some(a => a.slug === activeSlug);

        return (
          <div key={cat.label}>
            <button
              onClick={() => toggle(cat.label)}
              className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                hasActive
                  ? 'text-accent-primary'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/50'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left">{cat.label}</span>
              <ChevronRight
                className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="ml-4 pl-3 border-l border-border space-y-0.5 py-1">
                    {cat.articles.map(art => (
                      <button
                        key={art.slug}
                        onClick={() => onNavigate(art.slug)}
                        className={`block w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                          art.slug === activeSlug
                            ? 'bg-accent-primary/10 text-accent-primary font-medium'
                            : 'text-text-secondary hover:text-text-primary hover:bg-background-tertiary/50'
                        }`}
                      >
                        {art.title}
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </nav>
  );
}

// ── Search ─────────────────────────────────────────────────

function DocSearch({
  onSelect,
}: {
  onSelect: (slug: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return getAllArticles().filter(
      a =>
        a.title.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.content.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search documentation..."
          className="w-full pl-10 pr-4 py-2.5 bg-background-secondary border border-border rounded-lg text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:border-accent-primary/50 focus:ring-1 focus:ring-accent-primary/30 transition-colors"
        />
      </div>

      <AnimatePresence>
        {isFocused && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="absolute z-50 top-full mt-2 w-full bg-background-secondary border border-border rounded-lg shadow-2xl overflow-hidden"
          >
            {results.map(r => (
              <button
                key={r.slug}
                onMouseDown={() => {
                  onSelect(r.slug);
                  setQuery('');
                }}
                className="flex flex-col w-full text-left px-4 py-3 hover:bg-background-tertiary/50 transition-colors border-b border-border/50 last:border-0"
              >
                <span className="text-sm font-medium text-text-primary">{r.title}</span>
                <span className="text-xs text-text-tertiary">{r.category}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Article Content ────────────────────────────────────────

function ArticleContent({ article, category }: { article: DocArticle; category: string }) {
  return (
    <motion.article
      key={article.slug}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mb-4">
        <span className="text-xs font-medium text-accent-primary uppercase tracking-wider">
          {category}
        </span>
      </div>
      <h1 className="text-3xl font-bold text-text-primary mb-3">{article.title}</h1>
      {article.description && (
        <p className="text-text-secondary text-lg mb-8">{article.description}</p>
      )}
      <div
        className="docs-prose"
        dangerouslySetInnerHTML={{ __html: article.content }}
      />
    </motion.article>
  );
}

// ── Main Page ──────────────────────────────────────────────

function DocumentationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slugParam = searchParams.get('article');

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeSlug = slugParam || getDefaultArticle().slug;
  const found = findArticle(activeSlug);
  const article = found || getDefaultArticle();
  const category = found?.category || 'Getting Started';

  const navigate = useCallback(
    (slug: string) => {
      router.push(`/documentation?article=${slug}`, { scroll: false });
      setMobileMenuOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [router]
  );

  // Prev / Next navigation
  const allArticles = useMemo(() => getAllArticles(), []);
  const currentIndex = allArticles.findIndex(a => a.slug === activeSlug);
  const prevArticle = currentIndex > 0 ? allArticles[currentIndex - 1] : null;
  const nextArticle = currentIndex < allArticles.length - 1 ? allArticles[currentIndex + 1] : null;

  return (
    <div className="min-h-screen bg-background-primary">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-background-primary/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center h-14 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Terminal className="w-6 h-6 text-accent-primary" />
            <span className="text-base font-bold text-text-primary hidden sm:inline">Deep</span>
            <span className="text-base font-bold text-accent-secondary hidden sm:inline">Term</span>
          </Link>

          <span className="text-text-tertiary hidden sm:inline">/</span>
          <span className="text-sm font-medium text-text-secondary hidden sm:inline">Documentation</span>

          {/* Search (desktop) */}
          <div className="flex-1 max-w-md ml-auto hidden md:block">
            <DocSearch onSelect={navigate} />
          </div>

          {/* Mobile menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden ml-auto p-2 text-text-secondary hover:text-text-primary"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:block w-72 flex-shrink-0 border-r border-border sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto p-4">
          <DocSearch onSelect={navigate} />
          <div className="mt-4">
            <Sidebar activeSlug={activeSlug} onNavigate={navigate} />
          </div>
        </aside>

        {/* Mobile sidebar */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/50 z-30 md:hidden"
                onClick={() => setMobileMenuOpen(false)}
              />
              <motion.aside
                initial={{ x: -280 }}
                animate={{ x: 0 }}
                exit={{ x: -280 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed left-0 top-14 bottom-0 w-72 bg-background-primary border-r border-border z-30 overflow-y-auto p-4 md:hidden"
              >
                <DocSearch onSelect={navigate} />
                <div className="mt-4">
                  <Sidebar activeSlug={activeSlug} onNavigate={navigate} />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Content */}
        <main className="flex-1 min-w-0 px-6 py-10 sm:px-10 lg:px-16 max-w-3xl">
          <ArticleContent article={article} category={category} />

          {/* Prev / Next */}
          <div className="mt-16 pt-8 border-t border-border flex items-center justify-between gap-4">
            {prevArticle ? (
              <button
                onClick={() => navigate(prevArticle.slug)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent-primary transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <div className="text-left">
                  <div className="text-xs text-text-tertiary">Previous</div>
                  <div className="font-medium">{prevArticle.title}</div>
                </div>
              </button>
            ) : (
              <div />
            )}

            {nextArticle ? (
              <button
                onClick={() => navigate(nextArticle.slug)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent-primary transition-colors text-right"
              >
                <div>
                  <div className="text-xs text-text-tertiary">Next</div>
                  <div className="font-medium">{nextArticle.title}</div>
                </div>
                <ArrowLeft className="w-4 h-4 rotate-180" />
              </button>
            ) : (
              <div />
            )}
          </div>

          {/* Footer */}
          <footer className="mt-16 pt-8 border-t border-border text-center text-text-tertiary text-xs">
            <p>&copy; {new Date().getFullYear()} DeepTerm. All rights reserved.</p>
            <div className="mt-2 flex items-center justify-center gap-4">
              <Link href="/" className="hover:text-text-secondary transition-colors">
                Home
              </Link>
              <Link href="/security" className="hover:text-text-secondary transition-colors">
                Security
              </Link>
              <Link href="/dashboard/help" className="hover:text-text-secondary transition-colors flex items-center gap-1">
                Support <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

export default function DocumentationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background-primary flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DocumentationContent />
    </Suspense>
  );
}
