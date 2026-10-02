import { getBrowserTimeZone } from './api';
import type { UserPreferences } from './userPreferences';

export function getEffectiveTimeZone(
  preferences: UserPreferences
): string | null {
  const browserZone = getBrowserTimeZone();
  return preferences.time_zone_mode === 'manual'
    ? preferences.time_zone || browserZone
    : browserZone || preferences.time_zone;
}

export function parseRoundDateTime(value: string | null, timeZone: string) {
  if (!value) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    time: `${part('hour')}:${part('minute')}`,
  };
}

export function formatRoundDateTimeForApi(
  date: string,
  time: string
): string | null {
  if (!date) return null;
  if (!time) return `${date}T00:00:00`;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!match) throw new Error('Enter a valid time, such as 14:30 or 2:30 PM.');
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const period = match[3]?.toUpperCase();
  if (minutes > 59 || (period ? hours < 1 || hours > 12 : hours > 23)) {
    throw new Error('Enter a valid time, such as 14:30 or 2:30 PM.');
  }
  if (period) hours = (hours % 12) + (period === 'PM' ? 12 : 0);
  return `${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
}
