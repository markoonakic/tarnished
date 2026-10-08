import { expect, it } from 'vitest';
import { dayKey, reminderTarget, taskGroup } from './taskDates';
it('groups using the user zone and the real Monday-first week, including Sunday', () => {
  const now = new Date('2026-10-08T20:00:00Z');
  expect(taskGroup('2026-10-08T19:00Z', 'Europe/Belgrade', now)).toBe('overdue');
  expect(taskGroup('2026-10-08T21:00Z', 'Europe/Belgrade', now)).toBe('today');
  expect(taskGroup('2026-10-08T23:00Z', 'Europe/Belgrade', now)).toBe('tomorrow');
  expect(taskGroup('2026-10-11T10:00Z', 'Europe/Belgrade', now)).toBe('thisWeek');
  expect(taskGroup('2026-10-12T10:00Z', 'Europe/Belgrade', now)).toBe('later');
  const sunday = new Date('2026-10-11T10:00Z');
  expect(taskGroup('2026-10-12T10:00Z', 'Europe/Belgrade', sunday)).toBe('tomorrow');
  expect(taskGroup('2026-10-13T10:00Z', 'Europe/Belgrade', sunday)).toBe('later');
  expect(dayKey('2026-10-08T23:00Z', 'Europe/Belgrade')).toBe('2026-10-09');
});
it('links all five reminder targets, without inventing a target for personal reminders', () => {
  expect(reminderTarget({ round_id: 'r' })).toEqual({ type: 'round', id: 'r', href: '/interviews/r' });
  expect(reminderTarget({ lead_id: 'l' })?.href).toBe('/job-leads/l');
  expect(reminderTarget({ company_id: 'c' })?.href).toBe('/companies/c');
  expect(reminderTarget({ contact_id: 'c' })?.href).toBe('/contacts/c');
  expect(reminderTarget({ application_id: 'a' })?.href).toBe('/applications/a');
  expect(reminderTarget({})).toBeNull();
});
