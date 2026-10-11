import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { apiV030, type Reminder } from '@/lib/apiV030';
import AddressReminders from './AddressReminders';

vi.mock('@/lib/apiV030', () => ({
  apiV030: { reminders: vi.fn(), updateReminder: vi.fn() },
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
  }),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each(['company', 'contact'] as const)(
  'guards pending %s reminder changes until success or failure',
  async (type) => {
    const item = {
      id: 'one',
      title: 'Held reminder',
      kind: 'expected_feedback',
      state: 'open',
      due_at: '2026-10-11T09:00:00Z',
      revision: 2,
    } as Reminder;
    vi.mocked(apiV030.reminders).mockResolvedValue({
      items: [item],
      total: 1,
      page: 1,
      per_page: 100,
    });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={client}>
        <AddressReminders type={type} id="record" name="Company" />
      </QueryClientProvider>
    );
    const button = await screen.findByRole('button', {
      name: 'Complete Held reminder',
    });
    const guarded = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    for (const fails of [false, true]) {
      let resolve!: (value: Reminder) => void;
      let reject!: (error: Error) => void;
      vi.mocked(apiV030.updateReminder).mockImplementationOnce(
        () =>
          new Promise((yes, no) => {
            resolve = yes;
            reject = no;
          })
      );
      fireEvent.click(button);
      expect(button).toBeDisabled();
      expect(guarded()).toBe(true);
      expect(apiV030.updateReminder).toHaveBeenLastCalledWith('one', {
        state: 'done',
        expected_revision: 2,
      });
      await act(async () => {
        if (fails) reject(new Error('Offline'));
        else resolve(item);
      });
      await waitFor(() => expect(button).toBeEnabled());
      expect(guarded()).toBe(false);
    }
    client.clear();
  }
);
