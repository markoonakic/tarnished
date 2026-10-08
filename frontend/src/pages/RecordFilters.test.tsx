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
