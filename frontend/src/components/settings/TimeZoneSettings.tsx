import { useTranslation } from 'react-i18next';
import SearchableCombobox from '../SearchableCombobox';
import { getBrowserTimeZone } from '@/lib/api';
import { getSupportedTimeZones } from '@/lib/timeZones';
import {
  useUpdateUserPreferences,
  useUserPreferences,
} from '@/hooks/useUserPreferences';
import { t } from '@/lib/i18n';

export default function TimeZoneSettings() {
  useTranslation();
  const { data, isLoading, isError, refetch } = useUserPreferences();
  const update = useUpdateUserPreferences({
    errorMessage: t('Failed to save time zone settings'),
  });
  const deviceZone = getBrowserTimeZone() || 'UTC';
  if (isLoading)
    return <p role="status">{t('Loading time zone settings...')}</p>;
  if (isError || !data)
    return (
      <div role="alert">
        <p>{t('Failed to load time zone settings.')}</p>
        <button onClick={() => void refetch()}>{t('Try Again')}</button>
      </div>
    );
  return (
    <div>
      <label
        htmlFor="language-time-zone"
        className="text-muted mb-1.5 block text-sm"
      >
        {t('Time Zone')}
      </label>
      <SearchableCombobox
        id="language-time-zone"
        containerBackground="bg1"
        value={
          data.time_zone_mode === 'device'
            ? 'device'
            : data.time_zone || deviceZone
        }
        options={[
          {
            value: 'device',
            label: `${deviceZone} · ${t('Use device time zone')}`,
          },
          ...getSupportedTimeZones(deviceZone).map((value) => ({
            value,
            label: value,
          })),
        ]}
        onChange={(value) => {
          if (!update.isPending)
            update.mutate(
              value === 'device'
                ? { time_zone_mode: 'device', time_zone: null }
                : { time_zone_mode: 'manual', time_zone: value }
            );
        }}
        placeholder={t('Search time zones')}
      />
    </div>
  );
}
