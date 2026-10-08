import {
  apiV030,
  type Reminder,
  type ReminderInput,
  type ReminderUpdate,
} from '@/lib/apiV030';
import { useToast } from './useToast';
import { t } from '@/lib/i18n';

export function useReminderActions() {
  const toast = useToast();
  const create = (data: ReminderInput) => apiV030.createReminder(data);
  async function update(
    item: Reminder,
    data: Omit<ReminderUpdate, 'expected_revision'>
  ) {
    return apiV030.updateReminder(item.id, {
      ...data,
      expected_revision: item.revision,
    });
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
    } catch {
      toast.error(t('tasks.saveFailed'));
    }
  }
  return { create, update, toggle, dismiss, remove };
}
