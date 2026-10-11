import {
  apiV030,
  type Reminder,
  type ReminderInput,
  type ReminderUpdate,
} from '@/lib/apiV030';
import { useToast } from './useToast';
import { t } from '@/lib/i18n';
import { useState } from 'react';
import { useUnsavedChanges } from './useUnsavedChanges';

export function useReminderActions() {
  const toast = useToast();
  const [pending, setPending] = useState(0);
  useUnsavedChanges(pending > 0);
  const create = (data: ReminderInput) => apiV030.createReminder(data);
  async function update(
    item: Reminder,
    data: Omit<ReminderUpdate, 'expected_revision'>
  ) {
    setPending((count) => count + 1);
    try {
      return await apiV030.updateReminder(item.id, {
        ...data,
        expected_revision: item.revision,
      });
    } finally {
      setPending((count) => count - 1);
    }
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
    setPending((count) => count + 1);
    try {
      await apiV030.deleteReminder(item.id, item.revision);
    } catch {
      toast.error(t('tasks.saveFailed'));
    } finally {
      setPending((count) => count - 1);
    }
  }
  return { create, update, toggle, dismiss, remove };
}
