import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import sr from '../locales/sr-Latn.json';
import type { Language } from './userPreferences';

export const LANGUAGE_STORAGE_KEY = 'tarnished-language';

export function browserLanguage(): Language {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === 'en' || saved === 'sr-Latn') return saved;
  } catch {
    /* Storage is optional in private browsing. */
  }
  const preferred = navigator.languages?.find((value) =>
    /^(en|sr)(?:-|$)/i.test(value)
  );
  return preferred && /^sr(?:-|$)/i.test(preferred) ? 'sr-Latn' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'sr-Latn': { translation: sr } },
  lng: browserLanguage(),
  fallbackLng: 'en',
  supportedLngs: ['en', 'sr-Latn'],
  load: 'currentOnly',
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});

function rememberLanguage(language: string) {
  document.documentElement.lang = language;
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    /* Optional storage. */
  }
}
rememberLanguage(i18n.language);
i18n.on('languageChanged', rememberLanguage);

export function isInterfaceText(value: string): boolean {
  return Object.hasOwn(en, value) || Object.values(en).includes(value) || Object.values(sr).includes(value);
}

export const t = i18n.t;
export function language(): Language {
  return i18n.resolvedLanguage === 'sr-Latn' ? 'sr-Latn' : 'en';
}
export function locale() {
  return language() === 'sr-Latn' ? 'sr-Latn-RS' : 'en-US';
}
export default i18n;

// For fixed labels supplied by a local option table, never user content.
export function uiLabel(key: string): string {
  return Object.hasOwn(en, key) ? t(key as keyof typeof en) : key;
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    keySeparator: false;
    nsSeparator: false;
    resources: { translation: typeof en };
  }
}
