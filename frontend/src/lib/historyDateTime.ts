import { t } from '@/lib/i18n';
/** History PATCH needs an instant with an offset; round inputs use a different contract. */
export function historyLocalTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (name: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}`;
}

export function normalizeHistoryTime(value: string): string {
  // Native datetime-local controls may serialize whole seconds with .000.
  const seconds = value.replace(/\.0+$/, '');
  return seconds.length === 16 ? `${seconds}:00` : seconds;
}

export function historyInstant(value: string, timeZone: string): string {
  const local = normalizeHistoryTime(value);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(local))
    throw new Error(t('Enter a complete date and time.'));
  const wall = Date.parse(`${local}Z`);
  if (
    !Number.isFinite(wall) ||
    new Date(wall).toISOString().slice(0, 19) !== local
  )
    throw new Error(t('Enter a valid date and time.'));
  // Sample both sides of an offset transition, then validate each candidate by
  // round-trip. Never guess the first occurrence of an ambiguous local time.
  const candidates = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3_600_000;
    const offset =
      Date.parse(
        `${historyLocalTime(new Date(sample).toISOString(), timeZone)}Z`
      ) - sample;
    const instant = wall - offset;
    if (historyLocalTime(new Date(instant).toISOString(), timeZone) === local)
      candidates.add(instant);
  }
  if (!candidates.size)
    throw new Error(
      t(
        'That time does not exist in {{timeZone}} because the clock changes. Choose another time.',
        { timeZone: timeZone }
      )
    );
  if (candidates.size > 1)
    throw new Error(
      t(
        'That time occurs twice in {{timeZone}} because the clock changes. Choose an unambiguous time.',
        { timeZone: timeZone }
      )
    );
  return new Date([...candidates][0]).toISOString();
}
