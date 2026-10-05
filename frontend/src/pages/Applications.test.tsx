import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Applications from './Applications';
import { listApplications } from '../lib/applications';
import { ToastProvider, useToastContext } from '../contexts/ToastContext';
import type { ApplicationListResponse } from '../lib/types';

vi.mock('../lib/applications', () => ({
  listApplications: vi.fn(),
  getApplicationSources: async () => [],
}));
vi.mock('../lib/settings', () => ({ listStatuses: async () => [] }));
vi.mock('../hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../components/ApplicationModal', () => ({ default: () => null }));
function Notifications() {
  const toast = useToastContext();
  return (
    <>
      <button onClick={() => toast.success('Unrelated notification')}>
        Notify
      </button>
      {toast.toasts.map((t) => (
        <button key={t.id} onClick={() => toast.removeToast(t.id)}>
          {t.message}
        </button>
      ))}
    </>
  );
}
function Location() {
  return <output aria-label="Location">{useLocation().search}</output>;
}
function mount(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <Applications />
        <Notifications />
        <Location />
      </ToastProvider>
    </MemoryRouter>
  );
}
function deferred() {
  let resolve!: (value: ApplicationListResponse) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ApplicationListResponse>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const empty = { items: [], total: 0, page: 1, per_page: 25 };
function search(value: string) {
  fireEvent.change(
    screen.getByPlaceholderText('Search company or job title...'),
    { target: { value } }
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listApplications).mockReset();
  vi.mocked(listApplications).mockImplementation(() => new Promise(() => {}));
});
afterEach(cleanup);

it('loads sorting from the URL and resets the page while keeping filters', async () => {
  vi.mocked(listApplications).mockResolvedValue(empty);
  mount(
    '/applications?sort=company&page=3&status=own&source=Referral&search=engineer'
  );
  expect(
    await screen.findByRole('combobox', { name: 'Sort applications' })
  ).toBeVisible();
  expect(listApplications).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sort: 'company',
      page: 3,
      status_id: 'own',
      source: 'Referral',
      search: 'engineer',
    })
  );
  fireEvent.click(screen.getByRole('combobox', { name: 'Sort applications' }));
  fireEvent.click(
    screen.getByRole('option', { name: 'Applied: oldest first' })
  );
  expect(listApplications).toHaveBeenLastCalledWith(
    expect.objectContaining({
      sort: 'applied_asc',
      page: 1,
      status_id: 'own',
      source: 'Referral',
    })
  );
  const params = new URLSearchParams(
    screen.getByLabelText('Location').textContent!
  );
  expect(params.get('sort')).toBe('applied_asc');
  expect(params.get('page')).toBe('1');
  expect(params.get('search')).toBe('engineer');
});

it('renders summary round counts without detail rounds in both layouts', async () => {
  const summary = {
    id: 'with-rounds',
    company: 'Scheduled interviews',
    job_title: 'Engineer',
    job_description: null,
    job_url: null,
    status: {
      id: 'applied',
      name: 'Applied',
      color: '#83a598',
      meaning: 'applied',
    },
    status_meaning: 'applied',
    status_meaning_provenance: 'recorded',
    evidence_revision: 0,
    response_state: 'not_recorded',
    response_occurred_on: null,
    response_recorded_at: null,
    response_reference: null,
    cv_path: null,
    cover_letter_path: null,
    applied_at: '2026-01-03',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z',
    job_lead_id: null,
    location: null,
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    recruiter_name: null,
    recruiter_title: null,
    recruiter_linkedin_url: null,
    requirements_must_have: [],
    requirements_nice_to_have: [],
    skills: [],
    years_experience_min: null,
    years_experience_max: null,
    source: null,
    round_count: 2,
  } satisfies ApplicationListResponse['items'][number];
  vi.mocked(listApplications).mockResolvedValue({
    ...empty,
    total: 3,
    items: [
      summary,
      { ...summary, id: 'one-round', company: 'One interview', round_count: 1 },
      {
        ...summary,
        id: 'without-rounds',
        company: 'No interviews',
        round_count: 0,
      },
    ],
  });
  mount();
  const table = await screen.findByRole('table');
  for (const [company, count] of [
    ['Scheduled interviews', 2],
    ['One interview', 1],
    ['No interviews', 0],
  ] as const) {
    const row = within(table).getByRole('row', { name: new RegExp(company) });
    expect
      .soft(within(row).queryByRole('cell', { name: String(count) }))
      .toBeInTheDocument();
    expect
      .soft(
        screen.queryByRole('link', {
          name: new RegExp(
            `${company}.*${count} ${count === 1 ? 'round' : 'rounds'}$`
          ),
        })
      )
      .toBeInTheDocument();
  }
});

it.each(['resolve', 'reject'] as const)(
  'ignores obsolete %s and finalization while the latest search is pending',
  async (outcome) => {
    const old = deferred(),
      latest = deferred();
    vi.mocked(listApplications)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    mount();
    search('latest');
    await act(async () => {
      if (outcome === 'resolve') old.resolve(empty);
      else old.reject(new Error('obsolete'));
    });
    expect(screen.getByText('Loading applications...')).toBeVisible();
    expect(
      screen.queryByText('Failed to load applications')
    ).not.toBeInTheDocument();
    expect(listApplications).toHaveBeenCalledTimes(2);
    await act(async () => latest.resolve(empty));
    expect(
      screen.getByText('No applications match your search or filters.')
    ).toBeVisible();
  }
);

it('keeps the latest success when an older success finishes later', async () => {
  const old = deferred(),
    latest = deferred();
  vi.mocked(listApplications)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(latest.promise);
  mount();
  search('latest');
  await act(async () => latest.resolve(empty));
  await act(async () =>
    old.resolve({
      ...empty,
      total: 1,
      items: [
        {
          id: 'old',
          company: 'Obsolete company',
          job_title: 'Old title',
          status: { id: 'a', name: 'Applied' },
          applied_at: '2026-01-01',
        } as ApplicationListResponse['items'][number],
      ],
    })
  );
  expect(screen.queryByText('Obsolete company')).not.toBeInTheDocument();
  expect(
    screen.getByText('No applications match your search or filters.')
  ).toBeVisible();
});

it('does not refetch on toast add/dismiss, and retry shares ownership with search', async () => {
  const retry = deferred(),
    latest = deferred();
  vi.mocked(listApplications)
    .mockRejectedValueOnce(new Error('offline'))
    .mockReturnValueOnce(retry.promise)
    .mockReturnValueOnce(latest.promise);
  mount();
  await act(async () => {});
  expect(listApplications).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByText(
      'No applications yet. Add your first application to get started.'
    )
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Notify' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Unrelated notification' })
  );
  expect(listApplications).toHaveBeenCalledTimes(1);
  // Remove the current failure notification before asserting that obsolete retry cannot add one.
  fireEvent.click(
    screen.getByRole('button', { name: 'Failed to load applications' })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  search('new search');
  await act(async () => retry.reject(new Error('obsolete retry')));
  expect(screen.getByText('Loading applications...')).toBeVisible();
  expect(
    screen.queryByText('Failed to load applications')
  ).not.toBeInTheDocument();
  await act(async () => latest.resolve(empty));
  expect(listApplications).toHaveBeenCalledTimes(3);
});

it('invalidates an outstanding request on unmount without a stale notification', async () => {
  const pending = deferred();
  vi.mocked(listApplications).mockReturnValueOnce(pending.promise);
  const view = render(
    <MemoryRouter>
      <ToastProvider>
        <Applications />
        <Notifications />
      </ToastProvider>
    </MemoryRouter>
  );
  view.rerender(
    <MemoryRouter>
      <ToastProvider>
        <Notifications />
      </ToastProvider>
    </MemoryRouter>
  );
  await act(async () => pending.reject(new Error('after unmount')));
  expect(
    screen.queryByText('Failed to load applications')
  ).not.toBeInTheDocument();
});
