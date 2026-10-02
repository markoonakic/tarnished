import { useEffect, useMemo, useState } from 'react';

import { getBrowserTimeZone } from '@/lib/api';
import { useUserPreferences } from '@/hooks/useUserPreferences';

function getDateKeyForTimeZone(
  timeZone: string | null,
  currentDate = new Date()
): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(currentDate);
  } catch {
    return currentDate.toISOString().slice(0, 10);
  }
}

function useEffectiveTimeZone(): string | null {
  const { data: preferences } = useUserPreferences();
  const browserTimeZone = getBrowserTimeZone();

  return useMemo(() => {
    if (preferences?.time_zone_mode === 'manual' && preferences.time_zone) {
      return preferences.time_zone;
    }
    return browserTimeZone;
  }, [browserTimeZone, preferences?.time_zone, preferences?.time_zone_mode]);
}

export function getDatePartsFromKey(dayKey: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dayKey.split('-').map(Number);
  return {
    year: Number.isFinite(year) ? year : new Date().getFullYear(),
    month: Number.isFinite(month) ? month : 1,
    day: Number.isFinite(day) ? day : 1,
  };
}

export function useEffectiveDayKey(): string {
  const effectiveTimeZone = useEffectiveTimeZone();
  const [dayKey, setDayKey] = useState(() =>
    getDateKeyForTimeZone(effectiveTimeZone)
  );

  useEffect(() => {
    setDayKey(getDateKeyForTimeZone(effectiveTimeZone));

    const intervalId = window.setInterval(() => {
      const nextKey = getDateKeyForTimeZone(effectiveTimeZone);
      setDayKey((currentKey) =>
        currentKey === nextKey ? currentKey : nextKey
      );
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, [effectiveTimeZone]);

  return dayKey;
}
