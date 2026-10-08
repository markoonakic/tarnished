import { useQueryClient } from '@tanstack/react-query';
import {
  apiV030,
  type Reminder,
  type ReminderInput,
  type ReminderUpdate,
} from '@/lib/apiV030';
import { useToast } from './useToast';
import { t } from '@/lib/i18n';

export function useReminderActions() {
  const client = useQueryClient();
  const toast = useToast();
  const refresh = () =>
    client.invalidateQueries({
      predicate: ({ queryKey }) =>
        [
          'tasks',
          'tasks-badge',
          'reminders',
          'dashboard-overview',
          'application-board',
        ].includes(String(queryKey[0])),
    });
  async function create(data: ReminderInput) {
    const saved = await apiV030.createReminder(data);
    await refresh();
    return saved;
  }
  async function update(
    item: Reminder,
    data: Omit<ReminderUpdate, 'expected_revision'>
  ) {
    const saved = await apiV030.updateReminder(item.id, {
      ...data,
      expected_revision: item.revision,
    });
    await refresh();
    return saved;
  }
  async function toggle(item: Reminder) {
    try {
      await update(item, { state: item.state === 'open' ? 'done' : 'open' });
    } catch {
      toast.error(t('tasks.saveFailed'));
    }
  }
  async function dismiss(item: Reminder) {
    try {
      await update(item, { state: 'dismissed' });
    } catch {
      toast.error(t('tasks.saveFailed'));
    }
  }
  async function remove(item: Reminder) {
    if (!confirm(t('tasks.deleteReminder'))) return;
    try {
      await apiV030.deleteReminder(item.id, item.revision);
      await refresh();
    } catch {
      toast.error(t('tasks.saveFailed'));
    }
  }
  return { create, update, toggle, dismiss, remove };
}
