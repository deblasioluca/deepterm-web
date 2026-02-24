'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppLocale, defaultLocale, resolveAppLocale } from '@/lib/i18n/core';
import { AppMessages, appMessages } from '@/lib/i18n/messages';

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  messages: AppMessages;
};

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

function getInitialLocale(): AppLocale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  const langFromQuery = new URLSearchParams(window.location.search).get('lang');
  if (langFromQuery) {
    return resolveAppLocale(langFromQuery);
  }

  const langFromStorage = window.localStorage.getItem('deepterm.locale');
  if (langFromStorage) {
    return resolveAppLocale(langFromStorage);
  }

  return resolveAppLocale(window.navigator.language);
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>(defaultLocale);

  useEffect(() => {
    setLocaleState(getInitialLocale());
  }, []);

  const setLocale = (nextLocale: AppLocale) => {
    setLocaleState(nextLocale);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem('deepterm.locale', nextLocale);
      document.cookie = `deepterm_locale=${nextLocale}; path=/; max-age=31536000; samesite=lax`;

      const url = new URL(window.location.href);
      url.searchParams.set('lang', nextLocale);
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      messages: appMessages[locale],
    }),
    [locale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider');
  }

  return context;
}
