import { describe, expect, it } from 'vitest';
import { formatRoundDateTimeForApi, parseRoundDateTime } from './roundDateTime';

describe('round date/time contract', () => {
  it.each([
    ['2026-01-01T15:30:27Z', 'Asia/Tokyo', '2026-01-02', '00:30'],
    ['2026-01-02T07:30:00Z', 'America/Los_Angeles', '2026-01-01', '23:30'],
    ['2026-03-08T06:30:00Z', 'America/New_York', '2026-03-08', '01:30'],
    ['2026-03-08T07:30:00Z', 'America/New_York', '2026-03-08', '03:30'],
    ['2026-11-01T05:30:00Z', 'America/New_York', '2026-11-01', '01:30'],
    ['2026-11-01T06:30:00Z', 'America/New_York', '2026-11-01', '01:30'],
  ])(
    'formats %s in %s without mixing UTC dates and local hours',
    (instant, zone, date, time) => {
      expect(parseRoundDateTime(instant, zone)).toEqual({ date, time });
    }
  );
  it.each(['25:00', '12:99', '0:00 PM', '13:00 AM', 'nonsense'])(
    'rejects invalid time %s',
    (time) => {
      expect(() => formatRoundDateTimeForApi('2026-01-01', time)).toThrow(
        'valid time'
      );
    }
  );
  it('submits local wall time and explicit clearing', () => {
    expect(formatRoundDateTimeForApi('2026-01-01', '2:30 PM')).toBe(
      '2026-01-01T14:30:00'
    );
    expect(formatRoundDateTimeForApi('2026-01-01', '')).toBe(
      '2026-01-01T00:00:00'
    );
    expect(formatRoundDateTimeForApi('', '14:30')).toBeNull();
  });
});
