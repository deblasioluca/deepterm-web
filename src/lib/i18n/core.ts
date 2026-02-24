export const appLocales = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
} as const;

export type AppLocale = keyof typeof appLocales;

export const defaultLocale: AppLocale = 'en';

export function resolveAppLocale(value: string | null | undefined): AppLocale {
  if (!value) {
    return defaultLocale;
  }

  const normalized = value.toLowerCase();
  if (normalized in appLocales) {
    return normalized as AppLocale;
  }

  const baseLang = normalized.split('-')[0];
  if (baseLang in appLocales) {
    return baseLang as AppLocale;
  }

  return defaultLocale;
}
