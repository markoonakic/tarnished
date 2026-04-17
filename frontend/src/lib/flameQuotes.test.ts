import { describe, expect, it } from 'vitest';

import { getStableFlameQuote } from './flameQuotes';

describe('getStableFlameQuote', () => {
  it('stays stable for the same burning streak input', () => {
    const quote = getStableFlameQuote({
      stateKey: 'burning-5',
      currentStreak: 5,
      totalActivityDays: 12,
      streakExhaustedAt: null,
    });

    expect(
      getStableFlameQuote({
        stateKey: 'burning-5',
        currentStreak: 5,
        totalActivityDays: 12,
        streakExhaustedAt: null,
      })
    ).toBe(quote);
  });

  it('changes when the burning streak advances by a day', () => {
    const dayFive = getStableFlameQuote({
      stateKey: 'burning-5',
      currentStreak: 5,
      totalActivityDays: 12,
      streakExhaustedAt: null,
    });
    const daySix = getStableFlameQuote({
      stateKey: 'burning-6',
      currentStreak: 6,
      totalActivityDays: 13,
      streakExhaustedAt: null,
    });

    expect(daySix).not.toBe(dayFive);
  });
});
