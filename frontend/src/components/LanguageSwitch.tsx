import { useTranslation } from 'react-i18next';
import i18n, { language, t } from '@/lib/i18n';

export default function LanguageSwitch() {
  useTranslation();
  return (
    <div
      className="text-muted mt-5 flex justify-center gap-2 text-sm"
      role="group"
      aria-label={t('Language')}
    >
      {(['en', 'sr-Latn'] as const).map((value, index) => (
        <span key={value} className="flex items-center gap-2">
          {index > 0 && <span aria-hidden="true">|</span>}
          <button
            type="button"
            lang={value}
            aria-pressed={language() === value}
            onClick={() => void i18n.changeLanguage(value)}
            className={`focus:ring-accent-bright cursor-pointer rounded px-2 py-1 focus:ring-2 ${language() === value ? 'text-accent-bright' : 'hover:text-fg1'}`}
          >
            {value === 'en' ? 'EN' : 'SR'}
          </button>
        </span>
      ))}
    </div>
  );
}
