import { locale, t } from './i18n';
import type { Reminder, Target, TargetType } from './apiV030';
import { parseRoundDateTime } from './roundDateTime';

export const taskGroups = [
  'overdue',
  'today',
  'tomorrow',
  'thisWeek',
  'later',
] as const;
export function dayKey(value: string | Date, zone: string): string {
  return parseRoundDateTime(new Date(value).toISOString(), zone).date;
}
export function taskGroup(
  due: string,
  zone: string,
  now = new Date()
): (typeof taskGroups)[number] {
  if (new Date(due) < now) return 'overdue';
  const today = dayKey(now, zone);
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  const tomorrow = date.toISOString().slice(0, 10);
  const key = dayKey(due, zone);
  if (key === today) return 'today';
  if (key === tomorrow) return 'tomorrow';
  date.setUTCDate(date.getUTCDate() - 1);
  date.setUTCDate(date.getUTCDate() + 6 - ((date.getUTCDay() + 6) % 7));
  return key <= date.toISOString().slice(0, 10) ? 'thisWeek' : 'later';
}
export function dueText(
  due: string,
  zone: string,
  now = new Date(),
  includeDay = false
) {
  const group = taskGroup(due, zone, now);
  const date = new Date(due);
  if (group === 'overdue') {
    const minutes = Math.max(
      1,
      Math.floor((now.getTime() - date.getTime()) / 60_000)
    );
    if (minutes >= 1440)
      return t('tasks.daysAgo', { count: Math.floor(minutes / 1440) });
    if (minutes >= 60)
      return t('tasks.hoursAgo', { count: Math.floor(minutes / 60) });
    return t('tasks.minutesAgo', { count: minutes });
  }
  const time = date.toLocaleTimeString(locale(), {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  if (group === 'today' || group === 'tomorrow')
    return includeDay ? t('tasks.' + group + 'At', { time }) : time;
  const day = date.toLocaleDateString(locale(), {
    timeZone: zone,
    ...(group === 'thisWeek'
      ? { weekday: 'short' }
      : { month: 'short', day: 'numeric' }),
  });
  return `${day}, ${time}`;
}
export function reminderTarget(
  item: Target
): { type: TargetType; id: string; href: string } | null {
  const paths: Record<TargetType, string> = {
    lead: 'job-leads',
    application: 'applications',
    company: 'companies',
    contact: 'contacts',
    round: 'interviews',
  };
  for (const type of Object.keys(paths) as TargetType[]) {
    const id = item[`${type}_id`];
    if (id) return { type, id, href: `/${paths[type]}/${id}` };
  }
  return null;
}
export function reminderDraft(item: Reminder, zone: string) {
  const { date, time } = parseRoundDateTime(item.due_at, zone);
  return {
    kind: item.kind,
    title: item.title,
    due_date: date,
    due_time: time,
    note: item.note ?? '',
  };
}
export const reminderTargetFields = (type: TargetType, id: string): Target => ({
  [`${type}_id`]: id,
});
