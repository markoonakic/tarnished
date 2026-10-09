import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { queryClient } from '@/lib/queryClient';
import { apiV030, type Reminder } from '@/lib/apiV030';
import {
  notificationKey,
  setNotificationsEnabled,
  useReminderNotifications,
} from './useReminderNotifications';
import ReminderNotificationSettings from '@/components/settings/ReminderNotificationSettings';

vi.mock('@/lib/apiV030', () => ({ apiV030: { tasks: vi.fn() } }));
vi.mock('@/lib/reminderRelated', () => ({
  reminderRelatedQuery: () => ({
    queryKey: ['related'],
    queryFn: async () => 'Orbis Ledger — Engineer',
  }),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
const shown = vi.fn();
const close = vi.fn();
class MockNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => {
    MockNotification.permission = 'granted';
    return 'granted' as const;
  });
  onclick: (() => void) | null = null;
  close = close;
  constructor(title: string, options: NotificationOptions) {
    shown(title, options, this);
  }
}
const due = {
  id: 'due',
  title: 'Prepare SQL',
  state: 'open',
  due_at: '2026-01-01T09:00:00Z',
  application_id: 'application',
} as Reminder;
function Harness({ user = 'owner' }: { user?: string }) {
  useReminderNotifications(user);
  const location = useLocation();
  return (
    <>
      <span>{location.pathname}</span>
      <ReminderNotificationSettings />
    </>
  );
}
async function flush(ms = 100) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T10:00:00Z'));
  queryClient.clear();
  localStorage.clear();
  vi.clearAllMocks();
  MockNotification.permission = 'default';
  vi.stubGlobal('Notification', MockNotification);
  vi.spyOn(window, 'focus').mockImplementation(() => {});
  vi.mocked(apiV030.tasks).mockResolvedValue({
    items: [
      due,
      { ...due, id: 'future', due_at: '2026-01-02T10:00:00Z' },
      { ...due, id: 'done', state: 'done' },
    ],
    total: 3,
    page: 1,
    per_page: 100,
    badge: { total: 1, overdue: 1, due_today: 0 },
    deadlines: [],
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it('is off by default and asks permission only on the switch', async () => {
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(apiV030.tasks).not.toHaveBeenCalled();
  expect(MockNotification.requestPermission).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('switch'));
  await flush();
  expect(MockNotification.requestPermission).toHaveBeenCalledOnce();
  expect(shown).toHaveBeenCalledOnce();
  expect(shown.mock.calls[0].slice(0, 2)).toEqual([
    'Reminder: Prepare SQL',
    { body: 'Orbis Ledger — Engineer', tag: 'owner:due' },
  ]);
  expect(localStorage.getItem(notificationKey('owner', 'sent'))).toBe(
    '["due"]'
  );
  fireEvent.click(screen.getByRole('switch'));
  await flush(60_100);
  expect(shown).toHaveBeenCalledOnce();
});
it('checks each minute, persists IDs, and focuses Tasks on click', async () => {
  MockNotification.permission = 'granted';
  setNotificationsEnabled('owner', true);
  const view = render(
    <MemoryRouter initialEntries={['/profile']}>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(shown).toHaveBeenCalledOnce();
  await act(async () => {
    shown.mock.calls[0][2].onclick();
  });
  expect(window.focus).toHaveBeenCalled();
  expect(screen.getByText('/tasks')).toBeInTheDocument();
  expect(close).toHaveBeenCalledOnce();
  await flush(60_100);
  expect(apiV030.tasks).toHaveBeenCalledTimes(2);
  expect(shown).toHaveBeenCalledOnce();
  view.unmount();
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(shown).toHaveBeenCalledOnce();
});
it('shows denial and stays off without requesting on page open', async () => {
  MockNotification.permission = 'denied';
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(screen.getByText(/Permission denied/)).toBeVisible();
  expect(shown).not.toHaveBeenCalled();
  expect(MockNotification.requestPermission).not.toHaveBeenCalled();
});
it('does not share notification settings between accounts or require the API', async () => {
  setNotificationsEnabled('other', true);
  vi.stubGlobal('Notification', undefined);
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(screen.getByRole('switch')).toBeDisabled();
  expect(screen.getByText(/not available in this browser/)).toBeVisible();
  expect(apiV030.tasks).not.toHaveBeenCalled();
});
it('loads due reminders beyond the first page', async () => {
  MockNotification.permission = 'granted';
  setNotificationsEnabled('owner', true);
  const first = Array.from({ length: 100 }, (_, i) => ({
    ...due,
    id: String(i),
  }));
  localStorage.setItem(
    notificationKey('owner', 'sent'),
    JSON.stringify(first.map((item) => item.id))
  );
  vi.mocked(apiV030.tasks).mockImplementation(async (query) => ({
    items: query?.page === 1 ? first : [due],
    total: 101,
    page: query?.page ?? 1,
    per_page: 100,
    badge: { total: 101, overdue: 101, due_today: 0 },
    deadlines: [],
  }));
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>
  );
  await flush();
  expect(apiV030.tasks).toHaveBeenCalledWith({
    state: 'open',
    per_page: 100,
    page: 2,
  });
  expect(shown).toHaveBeenCalledOnce();
});
