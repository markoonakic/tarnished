import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Applications from './Applications';
import JobLeads from './JobLeads';
import { listApplications } from '@/lib/applications';
import { getJobLeads } from '@/lib/jobLeads';
import { apiV030 } from '@/lib/apiV030';
import { changeRecordFilters, recordFilters } from '@/lib/recordFilters';
import en from '@/locales/areas/records.en.json';
import sr from '@/locales/areas/records.sr-Latn.json';
import type { ApplicationSummary } from '@/lib/types';
import type { JobLeadListItem } from '@/lib/jobLeads';

vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('@/contexts/ToastContext', () => ({ useToastContext: () => toast }));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/lib/applications', () => ({
  listApplications: vi.fn(),
  getApplicationSources: async () => ['LinkedIn'],
}));
vi.mock('@/lib/jobLeads', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/jobLeads')>()),
  getJobLeads: vi.fn(),
  getJobLeadSources: async () => ['LinkedIn'],
}));
vi.mock('@/lib/settings', () => ({
  listStatuses: async () => [
    {
      id: 'applied',
      name: 'Applied',
      builtin_key: 'applied',
      meaning: 'applied',
      color: 'aqua',
    },
  ],
}));
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <output data-testid="url">{location.search}</output>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}
beforeEach(() => {
  vi.mocked(listApplications).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  vi.mocked(getJobLeads).mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  vi.spyOn(apiV030, 'companies').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 100,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
for (const type of ['application', 'lead'] as const) {
  it(`${type} list reads all filters from the URL, removes chips, and restores filters on browser Back`, async () => {
    const query =
      '?view=list&page=2&location=Belgrade&work_mode=hybrid&priority=high&tags=python&tags=sql&date_field=deadline&date_from=2026-10-01&show_archived=true';
    render(
      <MemoryRouter initialEntries={[query]}>
        {type === 'application' ? <Applications /> : <JobLeads />}
        <Location />
      </MemoryRouter>
    );
    const list = type === 'application' ? listApplications : getJobLeads;
    await waitFor(() =>
      expect(list).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          location: 'Belgrade',
          work_mode: 'hybrid',
          priority: 'high',
          tags: ['python', 'sql'],
          date_field: 'deadline',
          date_from: '2026-10-01',
          show_archived: true,
        })
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'More filters (6)' }));
    expect(screen.getByLabelText('Location')).toHaveValue('Belgrade');
    expect(screen.getByLabelText('Show archived')).toBeChecked();
    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Tags: python' })
    );
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, tags: ['sql'] })
      )
    );
    expect(screen.getByTestId('url')).not.toHaveTextContent('tags=python');
    expect(screen.getByTestId('url')).toHaveTextContent('view=list');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2, tags: ['python', 'sql'] })
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    await waitFor(() =>
      expect(screen.getByTestId('url')).toHaveTextContent('?view=list&page=1')
    );
    expect(
      screen.queryByRole('button', { name: /Remove Location/ })
    ).not.toBeInTheDocument();
  });
}
it.each(['application', 'lead'])(
  'bounds pasted %s searches before URL and API writes and constrains chips',
  async (type) => {
    render(
      <MemoryRouter>
        {type === 'application' ? <Applications /> : <JobLeads />}
        <Location />
      </MemoryRouter>
    );
    const input = await screen.findByRole('textbox', {
      name: type === 'application' ? 'Search applications' : 'Search job leads',
    });
    expect(input).toHaveAttribute('maxLength', '200');
    fireEvent.change(input, { target: { value: 'W'.repeat(80001) } });
    expect(input).toHaveValue('W'.repeat(200));
    expect(screen.getByTestId('url').textContent!.length).toBeLessThan(300);
    const list = type === 'application' ? listApplications : getJobLeads;
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'W'.repeat(200) })
      )
    );
    const chip = screen.getByRole('button', { name: /Remove Search/ });
    expect(chip).toHaveClass('max-w-full', 'min-w-0');
    expect(chip.parentElement).toHaveClass('min-w-0', 'max-w-full', 'w-full');
    expect(chip.querySelector('span')).toHaveClass('truncate');
  }
);
it.each(['application', 'lead'] as const)(
  'desktop %s name link adds one entry and one Back restores the list',
  async (kind) => {
    const result = { total: 1, page: 1, per_page: 25 };
    vi.mocked(listApplications).mockResolvedValue({
      ...result,
      items: [
        {
          id: 'app',
          company: 'Single link',
          status: { id: 'applied', name: 'Applied', meaning: 'applied' },
          round_count: 0,
        },
      ] as ApplicationSummary[],
    });
    vi.mocked(getJobLeads).mockResolvedValue({
      ...result,
      items: [
        {
          id: 'lead',
          company: 'Single link',
          title: 'Engineer',
          status: 'pending',
          decision: 'interesting',
          scraped_at: '2026-10-10',
        },
      ] as JobLeadListItem[],
    });
    const prefix = kind === 'application' ? 'applications' : 'job-leads';
    render(
      <MemoryRouter initialEntries={['/' + prefix + '?search=Single']}>
        {kind === 'application' ? <Applications /> : <JobLeads />}
        <Location />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('link', { name: 'Single link' }));
    expect(screen.getByTestId('url')).toHaveTextContent('');
    fireEvent.click(screen.getByRole('button', { name: /^Back$/ }));
    expect(screen.getByTestId('url')).toHaveTextContent('?search=Single');
  }
);

it('bounds URL tags and API filters, including pre-existing invalid tags', () => {
  const tags = [
    'ok',
    'W'.repeat(81007),
    ...Array.from({ length: 20 }, (_, i) => '😃'.repeat(50) + i),
  ];
  const next = changeRecordFilters(new URLSearchParams(), { tags });
  expect(next.getAll('tags')).toEqual(['ok']);
  expect(recordFilters(new URLSearchParams('tags=' + 'W'.repeat(301)))).toEqual(
    {}
  );
  const max = changeRecordFilters(new URLSearchParams(), {
    tags: Array.from({ length: 20 }, (_, i) => String(i) + '😃'.repeat(49)),
  });
  expect(max.getAll('tags')).toHaveLength(10);
  expect(max.toString().length).toBeLessThan(14000);
});

it('preserves unrelated URL state and uses repeated tag parameters', () => {
  const params = new URLSearchParams(
    'view=board&sort=company&page=3&tags=old&source=LinkedIn'
  );
  const next = changeRecordFilters(params, {
    tags: ['python', 'sql'],
    priority: 'high',
    source: '',
  });
  expect(next.toString()).toBe(
    'view=board&sort=company&page=1&tags=python&tags=sql&priority=high'
  );
  expect(recordFilters(next)).toEqual({
    tags: ['python', 'sql'],
    priority: 'high',
  });
  expect(params.get('page')).toBe('3');
  expect(changeRecordFilters(params, { view: 'list' }).get('page')).toBe('3');
});
it('ignores empty tags and false archived values instead of sending ambiguous filters', () => {
  expect(
    recordFilters(new URLSearchParams('tags=&location=&show_archived=false'))
  ).toEqual({});
});
it('has matching English and Serbian keys with no empty feature labels', () => {
  expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
  expect(Object.values(en).every(Boolean)).toBe(true);
  expect(Object.values(sr).every(Boolean)).toBe(true);
});
