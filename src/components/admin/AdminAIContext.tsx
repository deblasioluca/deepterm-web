'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AdminPageContext {
  page: string;
  summary: string;
  data?: Record<string, unknown>;
}

interface AdminAIContextValue {
  pageContext: AdminPageContext | null;
  setPageContext: (ctx: AdminPageContext | null) => void;
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

const AdminAIContext = createContext<AdminAIContextValue | null>(null);

export function AdminAIProvider({ children }: { children: ReactNode }) {
  const [pageContext, setPageContextState] = useState<AdminPageContext | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('admin-ai-panel-open') === 'true';
    }
    return false;
  });

  const setPageContext = useCallback((ctx: AdminPageContext | null) => {
    setPageContextState(ctx);
  }, []);

  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
    localStorage.setItem('admin-ai-panel-open', 'true');
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
    localStorage.setItem('admin-ai-panel-open', 'false');
  }, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen((prev) => {
      const next = !prev;
      localStorage.setItem('admin-ai-panel-open', String(next));
      return next;
    });
  }, []);

  return (
    <AdminAIContext.Provider
      value={{ pageContext, setPageContext, isPanelOpen, openPanel, closePanel, togglePanel }}
    >
      {children}
    </AdminAIContext.Provider>
  );
}

export function useAdminAI() {
  const ctx = useContext(AdminAIContext);
  if (!ctx) throw new Error('useAdminAI must be used inside AdminAIProvider');
  return ctx;
}
