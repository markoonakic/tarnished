import Button from '@/components/ui/Button';
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
          <Button
            type="button"
            lang={value}
            aria-pressed={language() === value}
            onClick={() => void i18n.changeLanguage(value)}
            className={` ${language() === value ? '' : ''} `}
          >
            {value === 'en' ? 'EN' : 'SR'}
          </Button>
        </span>
      ))}
    </div>
  );
}
