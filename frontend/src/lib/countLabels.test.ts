import { afterEach, expect, it } from 'vitest';
import i18n, { dictionaries } from './i18n';

const counts = [
  0, 1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 24, 25, 101, 111, 112, 114, 1.1, 1.2,
  1.5,
];
const forms: Record<string, [string, string, string]> = {
  daysCount: ['{{count}} dan', '{{count}} dana', '{{count}} dana'],
  applicationsCount: [
    '{{count}} prijava',
    '{{count}} prijave',
    '{{count}} prijava',
  ],
  itemsCount: ['{{count}} stavka', '{{count}} stavke', '{{count}} stavki'],
  pagination: [
    'Prikaz 1–2 od {{count}} stavke',
    'Prikaz 1–2 od {{count}} stavke',
    'Prikaz 1–2 od {{count}} stavki',
  ],
  applicationNoun: ['prijava', 'prijave', 'prijava'],
  audioParts: [
    'Završen {{count}} deo zvuka.',
    'Završena {{count}} dela zvuka.',
    'Završeno {{count}} delova zvuka.',
  ],
  roundCount: [
    '{{count}} krug intervjua',
    '{{count}} kruga intervjua',
    '{{count}} krugova intervjua',
  ],
  openNoun: ['otvorena', 'otvorene', 'otvorenih'],
  'accounts.years': [
    '{{count}} godina',
    '{{count}} godine',
    '{{count}} godina',
  ],
  'accounts.aiCount': [
    'AI može da koristi {{allowed}} od {{total}} stavke',
    'AI može da koristi {{allowed}} od {{total}} stavke',
    'AI može da koristi {{allowed}} od {{total}} stavki',
  ],
  'ai.proposalCount': [
    'Predlozi: {{count}} · Pregledano: {{reviewed}}',
    'Predlozi: {{count}} · Pregledano: {{reviewed}}',
    'Predlozi: {{count}} · Pregledano: {{reviewed}}',
  ],
  'Showing {{start}}–{{end}} of {{count}} items': [
    'Prikaz {{start}}–{{end}} od {{count}} stavke',
    'Prikaz {{start}}–{{end}} od {{count}} stavke',
    'Prikaz {{start}}–{{end}} od {{count}} stavki',
  ],
  'analytics.days': ['{{value}} dan', '{{value}} dana', '{{value}} dana'],
  'companies.linkedLeads': [
    '{{count}} oglas',
    '{{count}} oglasa',
    '{{count}} oglasa',
  ],
  'companies.linkedApplications': [
    '{{count}} prijava',
    '{{count}} prijave',
    '{{count}} prijava',
  ],
  'tasks.participantsCount': [
    '{{count}} učesnik',
    '{{count}} učesnika',
    '{{count}} učesnika',
  ],
  'tasks.preparationCount': [
    'Priprema: {{count}} stavka',
    'Priprema: {{count}} stavke',
    'Priprema: {{count}} stavki',
  ],
  'tasks.pipelineTotal': [
    '{{count}} prijava · arhivirane nisu uračunate',
    '{{count}} prijave · arhivirane nisu uračunate',
    '{{count}} prijava · arhivirane nisu uračunate',
  ],
  'records.savedPosting': [
    'Sačuvan oglas · {{count}} znak',
    'Sačuvan oglas · {{count}} znaka',
    'Sačuvan oglas · {{count}} znakova',
  ],
};
const values = {
  start: 1,
  end: 2,
  limit: 100000,
  reviewed: 1,
  allowed: 1,
  names: 'A',
  value0: 'prijava',
  date: '9. 10. 2026.',
  round: 'A',
  passed: 1,
  conversion_rate: 50,
};
const interpolate = (text: string, count: number) =>
  text.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(
      (
        { ...values, count, total: count, value: count } as Record<
          string,
          string | number
        >
      )[key]
    )
  );

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it.each(counts)(
  'uses correct Serbian forms for every inflected count label at %s',
  async (count) => {
    await i18n.changeLanguage('sr-Latn');
    const category = new Intl.PluralRules('sr-Latn').select(count);
    const index = category === 'one' ? 0 : category === 'few' ? 1 : 2;
    for (const [key, expected] of Object.entries(forms)) {
      expect(
        i18n.t(key, { ...values, count, total: count, value: count }),
        key
      ).toBe(interpolate(expected[index], count));
    }
  }
);

it('checks every other count label and requires new inflected labels to be covered', async () => {
  await i18n.changeLanguage('sr-Latn');
  const sr = dictionaries['sr-Latn'];
  const inflected = Object.keys(sr)
    .filter((key) => key.endsWith('_few'))
    .map((key) => key.slice(0, -4));
  expect(inflected.sort()).toEqual(Object.keys(forms).sort());
  const invariant = Object.keys(sr).filter(
    (key) =>
      sr[key].includes('{{count}}') &&
      !/_(one|few|other)$/.test(key) &&
      !(key in forms)
  );
  expect(invariant.length).toBeGreaterThan(15);
  for (const key of invariant) {
    for (const count of counts) {
      expect(i18n.t(key, { ...values, count }), key).toBe(
        interpolate(sr[key], count)
      );
    }
  }
});

it('keeps English singular and plural preparation, posting and pipeline labels', async () => {
  await i18n.changeLanguage('en');
  expect(i18n.t('tasks.preparationCount', { count: 1 })).toBe(
    'Preparation: 1 item'
  );
  expect(i18n.t('tasks.preparationCount', { count: 2 })).toBe(
    'Preparation: 2 items'
  );
  expect(i18n.t('records.savedPosting', { count: 1 })).toBe(
    'Saved posting · 1 character'
  );
  expect(i18n.t('tasks.pipelineTotal', { count: 1 })).toBe(
    '1 application · archived not counted'
  );
  expect(i18n.t('accounts.aiCount', { allowed: 1, total: 1, count: 1 })).toBe(
    'AI can use 1 of 1 item'
  );
  expect(i18n.t('ai.proposalCount', { count: 1, reviewed: 1 })).toBe(
    '1 proposal · 1 reviewed'
  );
  expect(
    i18n.t('Showing {{start}}–{{end}} of {{count}} items', {
      start: 1,
      end: 1,
      count: 1,
    })
  ).toBe('Showing 1–1 of 1 item');
});
