import { language } from './i18n';
import { queryClient } from './queryClient';
import type { UserPreferences } from './userPreferences';

function userZone() {
  const preferences = queryClient.getQueryData<UserPreferences>([
    'user-preferences',
  ]);
  return preferences?.time_zone_mode === 'manual'
    ? (preferences.time_zone ?? undefined)
    : undefined;
}

function dateValue(value: string | Date) {
  // Offset-free API timestamps are UTC; calendar dates stay unchanged.
  return typeof value === 'string'
    ? new Date(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) &&
          !/(Z|[+-]\d{2}:\d{2})$/.test(value)
          ? value + 'Z'
          : value
      )
    : value;
}

export function formatDate(
  value: string | Date | null | undefined,
  timeZone?: string
) {
  if (!value) return '—';
  const date = dateValue(value);
  const zone =
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? 'UTC'
      : (timeZone ?? userZone());
  const parts = new Intl.DateTimeFormat(
    language() === 'sr-Latn' ? 'sr-Latn-RS' : 'en-GB',
    {
      timeZone: zone,
      day: 'numeric',
      month: language() === 'sr-Latn' ? 'numeric' : 'short',
      year: 'numeric',
    }
  ).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value;
  return language() === 'sr-Latn'
    ? `${part('day')}. ${part('month')}. ${part('year')}.`
    : `${part('day')} ${part('month')} ${part('year')}`;
}

export function formatDateTime(
  value: string | Date | null | undefined,
  timeZone?: string
) {
  if (!value) return '—';
  const date = dateValue(value);
  const zone = timeZone ?? userZone();
  const time = new Intl.DateTimeFormat(
    language() === 'sr-Latn' ? 'sr-Latn-RS' : 'en-GB',
    {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }
  ).format(date);
  return `${formatDate(date, zone)}, ${time}`;
}
