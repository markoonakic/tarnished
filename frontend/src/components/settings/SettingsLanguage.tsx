import Button from '@/components/ui/Button';
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
import ReminderNotificationSettings from './ReminderNotificationSettings';
import HelpTip from '../HelpTip';

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
        <h2 className="text-fg1 mb-6 flex items-center gap-2 text-lg font-semibold">
          {t('Language & time')}{' '}
          <HelpTip label={t('Language & time')}>
            {t('Interface language and time zone for dates.')}{' '}
            {t(
              'AI replies use this language on the next explicit run. Quotes stay in the source language.'
            )}
          </HelpTip>
        </h2>
        {isLoading ? (
          <p role="status">{t('Loading...')}</p>
        ) : isError || !data ? (
          <div role="alert">
            <p>{t('Failed to load language settings.')}</p>
            <Button onClick={() => void refetch()}>{t('Try Again')}</Button>
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
                  <Button
                    key={value}
                    type="button"
                    lang={value}
                    aria-pressed={data.language === value}
                    disabled={update.isPending}
                    onClick={() => update.mutate({ language: value })}
                    className={` ${data.language === value ? '' : ''} `}
                  >
                    {value === 'en' ? 'English' : 'Srpski (latinica)'}
                  </Button>
                ))}
              </div>
            </div>
            <TimeZoneSettings />
            <p className="bg-bg2 text-fg1 rounded-lg px-4 py-3 text-sm">
              <span className="text-muted">{t('Example:')}</span>{' '}
              {formatDateTime('2026-10-08T12:30:00Z', zone)}
            </p>
            <ReminderNotificationSettings />
          </div>
        )}
      </section>
    </>
  );
}
