import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { apiV030, type Reminder } from '@/lib/apiV030';
import { useReminderActions } from './useReminderActions';
vi.mock('@/lib/apiV030', () => ({ apiV030: { updateReminder: vi.fn() } }));
vi.mock('./useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('protects pending reminder completion on every caller and clears protection after success or failure', async () => {
  let release!: (value: Reminder) => void;
  vi.mocked(apiV030.updateReminder).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const { result } = renderHook(useReminderActions);
  const unload = () => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  const reminder = { id: 'one', state: 'open', revision: 2 } as Reminder;
  let write!: Promise<void>;
  act(() => {
    write = result.current.toggle(reminder);
  });
  expect(unload()).toBe(true);
  await act(async () => {
    release(reminder);
    await write;
  });
  expect(unload()).toBe(false);
  vi.mocked(apiV030.updateReminder).mockRejectedValueOnce(new Error('Offline'));
  await act(async () => result.current.toggle(reminder));
  expect(unload()).toBe(false);
});
