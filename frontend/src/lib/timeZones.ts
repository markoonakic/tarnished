const COMMON_TIME_ZONES = [
  'UTC',
  'Europe/London',
  'Europe/Belgrade',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Athens',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export function getSupportedTimeZones(
  browserTimeZone: string | null
): string[] {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };

  const prioritized = [browserTimeZone, ...COMMON_TIME_ZONES].filter(
    (timeZone): timeZone is string => Boolean(timeZone)
  );

  try {
    const supported = intlWithSupportedValues.supportedValuesOf?.('timeZone');
    if (Array.isArray(supported) && supported.length > 0) {
      return Array.from(new Set([...prioritized, ...supported]));
    }
  } catch {
    // Fall back to a curated list below.
  }

  return Array.from(new Set(prioritized));
}
