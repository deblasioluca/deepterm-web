'use client';

import { useId } from 'react';
import { appLocales, AppLocale } from '@/lib/i18n/core';
import { useLocale } from './LocaleProvider';
import { cn } from '@/lib/utils';

export function LanguageSelector({ className = '' }: { className?: string }) {
  const selectId = useId();
  const { locale, setLocale, messages } = useLocale();

  return (
    <div className={cn('inline-flex items-center gap-2 flex-shrink-0', className)}>
      <label className="text-sm text-text-secondary hidden xl:inline" htmlFor={selectId}>
        {messages.common.language}
      </label>
      <select
        id={selectId}
        value={locale}
        onChange={(e) => setLocale(e.target.value as AppLocale)}
        className="min-w-[120px] px-3 py-2 rounded-lg bg-background-secondary border border-border text-text-primary hover:border-border-hover focus:outline-none focus:ring-2 focus:ring-accent-primary"
      >
        {Object.entries(appLocales).map(([localeCode, localeName]) => (
          <option key={localeCode} value={localeCode}>
            {localeName}
          </option>
        ))}
      </select>
    </div>
  );
}
