import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import JobLeads from './JobLeads';
import { getJobLeads } from '../lib/jobLeads';
import { ToastProvider, useToastContext } from '../contexts/ToastContext';

vi.mock('../lib/jobLeads', () => ({
  getJobLeads: vi.fn(),
  getJobLeadSources: async () => [],
}));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/JobLeadCaptureForm', () => ({ default: () => null }));

const empty = { items: [], total: 0, page: 1, per_page: 25, pages: 0 };
function deferred() {
  let resolve!: (value: Awaited<ReturnType<typeof getJobLeads>>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Awaited<ReturnType<typeof getJobLeads>>>(
    (res, rej) => {
      resolve = res;
      reject = rej;
    }
  );
  return { promise, resolve, reject };
}
function Notifications() {
  const toast = useToastContext();
  return (
    <>
      <button onClick={() => toast.success('Notification')}>Notify</button>
      {toast.toasts.map((item) => (
        <button key={item.id} onClick={() => toast.removeToast(item.id)}>
          {item.message}
        </button>
      ))}
    </>
  );
}
function mount() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <JobLeads />
        <Notifications />
      </ToastProvider>
    </MemoryRouter>
  );
}
function filter() {
  fireEvent.click(screen.getByRole('combobox', { name: 'All Statuses' }));
  fireEvent.click(screen.getByRole('option', { name: 'Failed' }));
}
beforeEach(() => {
  vi.mocked(getJobLeads).mockReset();
});
afterEach(cleanup);

it.each(['resolve', 'reject'])(
  'ignores an obsolete %s after filters change',
  async (outcome) => {
    const old = deferred(),
      latest = deferred();
    vi.mocked(getJobLeads)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    mount();
    filter();
    await act(async () => {
      if (outcome === 'resolve') old.resolve(empty);
      else old.reject(new Error('Old request'));
    });
    expect(screen.getByText('Loading job leads...')).toBeVisible();
    expect(
      screen.queryByText('Failed to load job leads')
    ).not.toBeInTheDocument();
    await act(async () => latest.resolve(empty));
    expect(
      screen.getByText('No job leads match your search or filters.')
    ).toBeVisible();
    expect(getJobLeads).toHaveBeenCalledTimes(2);
  }
);

it('does not reload when a notification is added or dismissed', async () => {
  vi.mocked(getJobLeads).mockRejectedValue(new Error('Offline'));
  mount();
  await screen.findByRole('button', { name: 'Reload list' });
  fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
  fireEvent.click(screen.getByRole('button', { name: 'Notification' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Failed to load job leads' })
  );
  expect(getJobLeads).toHaveBeenCalledOnce();
});

it('does not show errors from a request after unmount', async () => {
  const pending = deferred();
  vi.mocked(getJobLeads).mockReturnValue(pending.promise);
  const view = mount();
  view.rerender(
    <MemoryRouter>
      <ToastProvider>
        <Notifications />
      </ToastProvider>
    </MemoryRouter>
  );
  await act(async () => pending.reject(new Error('Offline')));
  expect(
    screen.queryByText('Failed to load job leads')
  ).not.toBeInTheDocument();
});
