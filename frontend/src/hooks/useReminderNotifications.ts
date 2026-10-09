import { useEffect, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { apiV030 } from '@/lib/apiV030';
import { queryClient } from '@/lib/queryClient';
import { reminderRelatedQuery } from '@/lib/reminderRelated';

const eventName = 'reminder-notifications-changed';
export function notificationKey(userId: string, suffix: string) {
  return `tarnished:reminder-notifications:${userId}:${suffix}`;
}
function stored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener(eventName, callback);
    window.removeEventListener('storage', callback);
  };
}
export function useNotificationsEnabled(userId?: string) {
  return useSyncExternalStore(
    subscribe,
    () =>
      Boolean(userId && stored(notificationKey(userId, 'enabled')) === 'true'),
    () => false
  );
}
export function setNotificationsEnabled(userId: string, enabled: boolean) {
  try {
    localStorage.setItem(notificationKey(userId, 'enabled'), String(enabled));
  } catch {
    return;
  }
  window.dispatchEvent(new Event(eventName));
}

export function useReminderNotifications(userId?: string) {
  const enabled = useNotificationsEnabled(userId);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const reminders = useQuery(
    {
      queryKey: ['tasks', 'notifications', userId],
      enabled: Boolean(
        userId &&
        enabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ),
      queryFn: async () => {
        const due = [];
        for (let page = 1; ; page++) {
          const result = await apiV030.tasks({
            state: 'open',
            per_page: 100,
            page,
          });
          due.push(
            ...result.items.filter(
              (item) =>
                item.state === 'open' && Date.parse(item.due_at) <= Date.now()
            )
          );
          if (
            !result.items.length ||
            page * 100 >= result.total ||
            result.items.some((item) => Date.parse(item.due_at) > Date.now())
          )
            return due;
        }
      },
      refetchInterval: 60_000,
      refetchIntervalInBackground: true,
    },
    queryClient
  );
  useEffect(() => {
    if (
      !userId ||
      !enabled ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted'
    )
      return;
    let active = true;
    const key = notificationKey(userId, 'sent');
    function sentIds(): string[] {
      try {
        const value: unknown = JSON.parse(stored(key) || '[]');
        return Array.isArray(value)
          ? value.filter((id): id is string => typeof id === 'string')
          : [];
      } catch {
        return [];
      }
    }
    void (async () => {
      for (const item of reminders.data ?? []) {
        if (!active || sentIds().includes(item.id)) continue;
        const body = await queryClient
          .fetchQuery(reminderRelatedQuery(item))
          .catch(() => '');
        if (
          !active ||
          sentIds().includes(item.id) ||
          Notification.permission !== 'granted'
        )
          continue;
        try {
          // Store only IDs, never reminder text. Check again after the related-record read.
          const notification = new Notification(
            t('tasks.notificationTitle', { title: item.title }),
            { body, tag: `${userId}:${item.id}` }
          );
          localStorage.setItem(key, JSON.stringify([...sentIds(), item.id]));
          notification.onclick = () => {
            window.focus();
            navigate('/tasks');
            notification.close();
          };
        } catch {
          /* Unsupported system notifications or unavailable browser storage. */
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, userId, reminders.data, reminders.dataUpdatedAt, navigate, t]);
}
