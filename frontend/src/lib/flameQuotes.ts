import { uiLabel } from './i18n';

export type FlameStateKey =
  'dormant' | 'ember' | 'extinguished' | `burning-${number}`;

interface QuotePools {
  dormant: string[];
  ember: string[];
  extinguished: string[];
  burning: string[];
}

interface StableFlameQuoteInput {
  stateKey: FlameStateKey;
  currentStreak: number;
  totalActivityDays: number;
  streakExhaustedAt: string | null;
}

const restrainedQuotes: QuotePools = {
  dormant: [
    'No flame yet. Begin.',
    'The first spark changes everything.',
    'Even silence may precede the blaze.',
    'The path is dark only for now.',
  ],
  ember: [
    'A spark remains. Guard it.',
    'What little burns must not be wasted.',
    'One more day may yet preserve the light.',
    'Let not the flame be lost today.',
  ],
  extinguished: [
    'Cold ash remembers heat.',
    'What is lost may still be rekindled.',
    'The fire is gone. Not the will.',
    'Ash is not the end of flame.',
  ],
  burning: [
    'What is tended grows.',
    'Each day feeds the flame.',
    'Consistency kindles strength.',
    'The light answers the hand that keeps it.',
    'Persistence is a patient fire.',
    'What is kept alive becomes its own guide.',
  ],
};

function stateBucket(stateKey: FlameStateKey): keyof QuotePools {
  if (stateKey.startsWith('burning')) return 'burning';
  if (stateKey === 'dormant') return 'dormant';
  if (stateKey === 'ember') return 'ember';
  return 'extinguished';
}

function hashText(value: string): number {
  return Array.from(value).reduce(
    (accumulator, character) => accumulator + character.charCodeAt(0),
    0
  );
}

function getQuoteSeed({
  stateKey,
  currentStreak,
  totalActivityDays,
  streakExhaustedAt,
}: StableFlameQuoteInput): number {
  const bucket = stateBucket(stateKey);

  switch (bucket) {
    case 'burning':
      return Math.max(0, currentStreak - 1);
    case 'ember':
      return Math.max(0, currentStreak);
    case 'extinguished':
      return hashText(streakExhaustedAt ?? String(totalActivityDays));
    case 'dormant':
      return totalActivityDays;
  }
}

export function getStableFlameQuote(input: StableFlameQuoteInput): string {
  const bucket = stateBucket(input.stateKey);
  const options = restrainedQuotes[bucket];
  const index = getQuoteSeed(input) % options.length;
  return uiLabel(options[index] ?? options[0] ?? '');
}
