import { formatDateTime } from '@/lib/displayDate';
import { useTranslation } from 'react-i18next';
import {
  useUserPreferences,
  useUpdateUserPreferences,
} from '@/hooks/useUserPreferences';
import { getBrowserTimeZone } from '@/lib/api';
import { t } from '@/lib/i18n';
import { SettingsBackLink } from './SettingsLayout';
import TimeZoneSettings from './TimeZoneSettings';

export default function SettingsLanguage() {
  useTranslation();
  const { data, isLoading, isError, refetch } = useUserPreferences();
  const update = useUpdateUserPreferences();
  const deviceZone = getBrowserTimeZone() || 'UTC';
  const zone =
    data?.time_zone_mode === 'manual'
      ? data.time_zone || deviceZone
      : deviceZone;
  return (
    <>
      <div className="md:hidden">
        <SettingsBackLink />
      </div>
      <section className="bg-secondary rounded-lg p-4 md:p-6">
        <h2 className="text-fg1 text-xl font-bold">{t('Language & time')}</h2>
        <p className="text-muted mt-1 mb-6 text-sm">
          {t('Interface language and time zone for dates.')}
        </p>
        {isLoading ? (
          <p role="status">{t('Loading...')}</p>
        ) : isError || !data ? (
          <div role="alert">
            <p>{t('Failed to load language settings.')}</p>
            <button onClick={() => void refetch()}>{t('Try Again')}</button>
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <p id="interface-language" className="text-muted mb-1.5 text-sm">
                {t('Interface language')}
              </p>
              <div
                className="bg-bg2 inline-flex max-w-full flex-wrap rounded-md p-1"
                role="group"
                aria-labelledby="interface-language"
              >
                {(['en', 'sr-Latn'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    lang={value}
                    aria-pressed={data.language === value}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ language: value })}
                    className={`focus:ring-accent-bright cursor-pointer rounded px-3 py-1 text-sm focus:ring-2 disabled:opacity-50 ${data.language === value ? 'bg-bg3 text-fg1' : 'text-muted hover:text-fg1'}`}
                  >
                    {value === 'en' ? 'English' : 'Srpski (latinica)'}
                  </button>
                ))}
              </div>
            </div>
            <TimeZoneSettings />
            <p className="bg-bg2 text-fg1 rounded-lg px-4 py-3 text-sm">
              <span className="text-muted">{t('Example:')}</span>{' '}
              {formatDateTime('2026-10-08T12:30:00Z', zone)}
            </p>
            <p className="text-muted text-xs">
              <i className="bi-stars mr-2" aria-hidden="true" />
              {t(
                'AI replies use this language on the next explicit run. Quotes stay in the source language.'
              )}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
