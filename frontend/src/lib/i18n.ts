import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import sr from '../locales/sr-Latn.json';
import type { Language } from './userPreferences';

// Area files use flat translation keys, as do the existing dictionaries.
// Each feature owns areas/<feature>.{en,sr-Latn}.json.
const areas = import.meta.glob<Record<string, string>>(
  '../locales/areas/*.{en,sr-Latn}.json',
  { eager: true, import: 'default' }
);
export const dictionaries: Record<Language, Record<string, string>> = {
  en: { ...en },
  'sr-Latn': { ...sr },
};
for (const path of Object.keys(areas).sort()) {
  const language = path.endsWith('.sr-Latn.json') ? 'sr-Latn' : 'en';
  Object.assign(dictionaries[language], areas[path]);
}

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
  resources: {
    en: { translation: dictionaries.en },
    'sr-Latn': { translation: dictionaries['sr-Latn'] },
  },
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
  return (
    Object.hasOwn(dictionaries.en, value) ||
    Object.values(dictionaries.en).includes(value) ||
    Object.values(dictionaries['sr-Latn']).includes(value)
  );
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
  return Object.hasOwn(dictionaries.en, key) ? t(key) : key;
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    keySeparator: false;
    nsSeparator: false;
    resources: { translation: typeof en & Record<string, string> };
  }
}
