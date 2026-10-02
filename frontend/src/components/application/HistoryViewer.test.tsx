import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import HistoryViewer from './HistoryViewer';
import { deleteHistoryEntry, getApplicationHistory } from '../../lib/history';

vi.mock('../../lib/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/history')>()),
  getApplicationHistory: vi.fn(),
  deleteHistoryEntry: vi.fn(),
}));
vi.mock('../../hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('shows three recent events and keeps the full history in its dialog', async () => {
  vi.mocked(getApplicationHistory).mockResolvedValue(
    Array.from({ length: 6 }, (_, index) => ({
      id: `event-${index}`,
      from_status: null,
      to_status: {
        id: 'applied',
        name: 'Applied',
        meaning: 'applied' as const,
        color: '#0f0',
      },
      from_meaning: null,
      to_meaning: 'applied' as const,
      from_meaning_provenance: 'recorded' as const,
      to_meaning_provenance: 'recorded' as const,
      time_provenance: 'recorded' as const,
      changed_at: '2026-04-14T10:00:00Z',
      is_gap: false,
      note: `Event note ${index}`,
      corrected_at: null,
      correction_note: null,
    }))
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HistoryViewer applicationId="app" revision={3} />
    </QueryClientProvider>
  );
  await screen.findByText('Event note 0');
  expect(screen.getAllByText(/Event note/)).toHaveLength(3);
  expect(screen.queryByText(/Historical meaning/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'View 3 more' }));
  const dialog = screen.getByRole('dialog', { name: 'Status History' });
  expect(within(dialog).getAllByText(/Event note/)).toHaveLength(6);
  client.clear();
});

it('keeps deletion failure inside the open dialog as a live alert, then exposes it on the page after closing', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(getApplicationHistory).mockResolvedValue([
    {
      id: 'history',
      from_status: null,
      to_status: {
        id: 'applied',
        name: 'Applied',
        meaning: 'applied',
        color: '#0f0',
      },
      from_meaning: null,
      to_meaning: 'applied',
      from_meaning_provenance: 'recorded',
      to_meaning_provenance: 'recorded',
      time_provenance: 'recorded',
      changed_at: '2026-04-14T10:00:00Z',
      is_gap: false,
      note: null,
      corrected_at: null,
      correction_note: null,
    },
  ]);
  vi.mocked(deleteHistoryEntry).mockRejectedValue(new Error('offline'));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <HistoryViewer applicationId="app" revision={3} />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Edit History' }));
  fireEvent.click(screen.getByRole('button', { name: 'View All History' }));
  const dialog = screen.getByRole('dialog', { name: 'Status History' });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(
    'Deletion failed. Reload if evidence changed before retrying.'
  );
  expect(deleteHistoryEntry).toHaveBeenCalledWith('app', 'history', 3);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  fireEvent(dialog, new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Deletion failed.');
  client.clear();
});
