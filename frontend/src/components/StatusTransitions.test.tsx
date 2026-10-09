import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import StatusChangeDialog from './StatusChangeDialog';
import ApplicationBoard from './ApplicationBoard';

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
  }),
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
const statuses = [
  'Preparing',
  'Applied',
  'Screening',
  'Interviewing',
  'Offer',
  'Accepted',
  'Rejected',
  'Withdrawn',
  'No Reply',
].map((name) => ({
  id: name.toLowerCase().replace(' ', '_'),
  name,
  meaning: name.toLowerCase().replace(' ', '_'),
}));
const pairs = statuses.flatMap((from) =>
  statuses.filter((to) => to.id !== from.id).map((to) => ({ from, to }))
);
const original = api.defaults.adapter;
beforeEach(() => queryClient.clear());
afterEach(() => {
  cleanup();
  queryClient.clear();
  api.defaults.adapter = original;
});
it.each(pairs)('detail dialog: $from.name → $to.name', async ({ from, to }) => {
  const save = vi.fn();
  render(
    <StatusChangeDialog
      statusId={to.id}
      appliedAt={from.id === 'preparing' ? null : '2026-10-01'}
      timeZone="UTC"
      options={statuses.map((s) => ({
        value: s.id,
        label: s.name,
        meaning: s.meaning,
      }))}
      onClose={vi.fn()}
      onSave={save}
    />
  );
  if (from.id === 'preparing') {
    expect(screen.getByLabelText('Sent date')).toHaveValue(
      new Date().toISOString().slice(0, 10)
    );
    fireEvent.change(screen.getByLabelText('Sent date'), {
      target: { value: '2026-10-02' },
    });
  } else expect(screen.queryByLabelText('Sent date')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(save).toHaveBeenCalledOnce());
  expect(save.mock.calls[0][0]).toMatchObject({
    status_id: to.id,
    ...(from.id === 'preparing' ? { applied_at: '2026-10-02' } : {}),
  });
  if (from.id !== 'preparing')
    expect(save.mock.calls[0][0]).not.toHaveProperty('applied_at');
});
it.each(pairs)('board: $from.name → $to.name', async ({ from, to }) => {
  const write = vi.fn();
  api.defaults.adapter = async (config) => {
    let data: unknown = {};
    if (config.url === '/api/statuses') data = statuses;
    if (config.url === '/api/applications/board')
      data = {
        columns: statuses.map((s) => ({
          status_id: s.id,
          count: s.id === from.id ? 1 : 0,
          items:
            s.id === from.id
              ? [
                  {
                    id: 'app',
                    company: 'North',
                    job_title: 'Engineer',
                    status: from,
                    evidence_revision: 4,
                    applied_at: from.id === 'preparing' ? null : '2026-10-01',
                    round_count: 0,
                  },
                ]
              : [],
        })),
      };
    if (config.method === 'patch') {
      write(JSON.parse(config.data));
      data = {};
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config };
  };
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApplicationBoard />
      </MemoryRouter>
    </QueryClientProvider>
  );
  if (['rejected', 'withdrawn'].includes(from.id))
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(from.name) })
    );
  await screen.findByText('Engineer');
  const menu = document.querySelector('article details') as HTMLDetailsElement;
  menu.open = true;
  fireEvent(menu, new Event('toggle'));
  fireEvent.click(within(menu).getByRole('button', { name: to.name }));
  const dialog = await screen.findByRole('dialog');
  if (from.id === 'preparing')
    fireEvent.change(within(dialog).getByLabelText('Sent date'), {
      target: { value: '2026-10-02' },
    });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(write).toHaveBeenCalledOnce());
  expect(write.mock.calls[0][0]).toMatchObject({
    status_id: to.id,
    expected_revision: 4,
    ...(from.id === 'preparing' ? { applied_at: '2026-10-02' } : {}),
  });
});
