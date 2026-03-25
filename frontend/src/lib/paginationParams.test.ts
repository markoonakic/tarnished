import { describe, expect, it } from 'vitest';

import { parsePositivePageParam } from './paginationParams';

describe('pagination param helpers', () => {
  it('returns the parsed page when the query value is a positive integer', () => {
    expect(parsePositivePageParam('3')).toBe(3);
  });

  it('falls back to page one for missing or invalid values', () => {
    expect(parsePositivePageParam(null)).toBe(1);
    expect(parsePositivePageParam('')).toBe(1);
    expect(parsePositivePageParam('abc')).toBe(1);
    expect(parsePositivePageParam('0')).toBe(1);
    expect(parsePositivePageParam('-2')).toBe(1);
  });

  it('floors decimal-looking values to a positive page only when parseInt yields a valid integer', () => {
    expect(parsePositivePageParam('2.5')).toBe(2);
  });
});
