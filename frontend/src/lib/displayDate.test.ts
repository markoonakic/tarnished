import { afterEach, expect, it } from 'vitest';
import i18n from './i18n';
import { queryClient } from './queryClient';
import { formatDate, formatDateTime } from './displayDate';

afterEach(async () => {
  queryClient.clear();
  await i18n.changeLanguage('en');
});

it('uses one English date format and does not shift date-only fields', async () => {
  await i18n.changeLanguage('en');
  queryClient.setQueryData(['user-preferences'], {
    time_zone_mode: 'manual',
    time_zone: 'America/Los_Angeles',
  });
  expect(formatDate('2026-10-08')).toBe('8 Oct 2026');
  expect(formatDateTime('2026-10-08T14:30:00Z')).toBe('8 Oct 2026, 07:30');
});

it('uses the selected zone for offset-free UTC stamps and Serbian dates', async () => {
  await i18n.changeLanguage('sr-Latn');
  queryClient.setQueryData(['user-preferences'], {
    time_zone_mode: 'manual',
    time_zone: 'Europe/Belgrade',
  });
  expect(formatDate('2026-10-08')).toBe('8. 10. 2026.');
  expect(formatDateTime('2026-10-08T14:30:00')).toBe('8. 10. 2026., 16:30');
  expect(i18n.t('tasks.participantsCount', { count: 1 })).toBe('1 učesnik');
  expect(i18n.t('tasks.participantsCount', { count: 2 })).toBe('2 učesnika');
  expect(i18n.t('companies.linkedLeads', { count: 1 })).toBe('1 oglas');
  expect(i18n.t('companies.linkedApplications', { count: 2 })).toBe(
    '2 prijave'
  );
});
