import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { queryClient } from '@/lib/queryClient';
import type { Activity, Breakdown, Page } from '@/lib/apiV030';
import AnalyticsNewKpis from './AnalyticsNewKpis';
import AnalyticsBreakdowns from './AnalyticsBreakdowns';
import AnalyticsActivity from './AnalyticsActivity';
import en from '@/locales/areas/analytics.en.json';
import sr from '@/locales/areas/analytics.sr-Latn.json';

const { breakdowns, activity } = vi.hoisted(() => ({
  breakdowns: vi.fn(),
  activity: vi.fn(),
}));
vi.mock('@/lib/apiV030', () => ({ apiV030: { breakdowns, activity } }));
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-08',
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
  }),
}));

const breakdown: Breakdown = {
  first_response: { mean_days: 6.4, n: 71, unknown_count: 9 },
  rejected_count: 41,
  current_phases: [],
  outcomes_by_source: [
    {
      source: 'LinkedIn',
      sent: 62,
      interview: 9,
      offer: 1,
      rejected: 14,
      withdrawn: 4,
    },
  ],
  top_positions: [{ label: 'Junior Backend Engineer', count: 48 }],
  top_technologies: [{ label: 'Python', count: 112 }],
  stage_averages: [],
  repeated_requirements: { items: [], denominator: 0 },
  missing_evidence: { items: [], denominator: 0 },
  as_of: '2026-10-08T12:00:00Z',
};
const event: Activity = {
  id: 'e1',
  event: 'status.changed',
  occurred_at: '2026-10-08T10:42:00Z',
  application_id: 'app',
  round_id: null,
  target_type: 'application',
  target_id: 'app',
  target_label: 'North',
};
const firstPage: Page<Activity> = {
  items: [event],
  total: 2,
  page: 1,
  per_page: 1,
};

beforeEach(async () => {
  queryClient.clear();
  queryClient.setDefaultOptions({
    queries: { retry: false, refetchInterval: false },
  });
  breakdowns.mockReset().mockResolvedValue(structuredClone(breakdown));
  activity.mockReset().mockResolvedValue(firstPage);
  await i18n.changeLanguage('en');
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

function renderAdditions(period = 'all', asOf?: string) {
  return render(
    <MemoryRouter>
      <AnalyticsNewKpis period={period} asOf={asOf} />
      <AnalyticsBreakdowns period={period} asOf={asOf} />
      <AnalyticsActivity period={period} asOf={asOf} />
    </MemoryRouter>
  );
}

describe('deterministic analytics additions', () => {
  it('shows dated response sample, distinct rejection count, source outcomes and frequencies using one shared read', async () => {
    renderAdditions('30d', breakdown.as_of);
    expect(await screen.findByText('6.4 days')).toBeVisible();
    expect(screen.getByText('n = 71 · 9 without a valid date')).toBeVisible();
    expect(screen.getByText('41')).toBeVisible();
    const table = screen.getByRole('table', { name: 'By source' });
    expect(
      within(table).getByRole('columnheader', { name: 'Withdrawn' })
    ).toBeVisible();
    expect(
      within(table).getByRole('rowheader', { name: 'LinkedIn' })
    ).toBeVisible();
    expect(screen.getByText('Junior Backend Engineer')).toHaveAttribute(
      'title',
      'Junior Backend Engineer'
    );
    expect(screen.getByText('Python')).toBeVisible();
    expect(
      (await screen.findByText('Status changed')).parentElement
    ).toHaveTextContent('Status changed · North');
    expect(breakdowns).toHaveBeenCalledTimes(1);
    expect(breakdowns).toHaveBeenCalledWith({
      period: '30d',
      as_of: breakdown.as_of,
    });
    expect(activity).toHaveBeenCalledWith({
      period: '30d',
      as_of: breakdown.as_of,
      page: 1,
      per_page: 25,
    });
  });

  it('shows translated status transitions and event-specific icons', async () => {
    activity.mockResolvedValue({
      ...firstPage,
      items: [
        {
          ...event,
          from_status: { name: 'Applied', builtin_key: 'applied' },
          to_status: { name: 'Rejected', builtin_key: 'rejected' },
        },
        { ...event, id: 'note', event: 'workspace.note.created' },
        { ...event, id: 'reminder', event: 'workspace.reminder.created' },
      ],
    });
    const { container } = renderAdditions();
    expect(await screen.findByText('Applied → Rejected')).toBeVisible();
    expect(container.querySelector('.bi-arrow-right')).toBeInTheDocument();
    expect(container.querySelector('.bi-journal-text')).toBeInTheDocument();
    expect(container.querySelector('.bi-bell')).toBeInTheDocument();
    await act(() => i18n.changeLanguage('sr-Latn'));
    expect(await screen.findByText('Poslata → Odbijena')).toBeVisible();
  });

  it('does not turn missing dates into zero and shows empty data without invented results', async () => {
    breakdowns.mockResolvedValue({
      ...breakdown,
      first_response: { mean_days: null, n: 0, unknown_count: 3 },
      outcomes_by_source: [],
      top_positions: [],
      top_technologies: [],
    });
    activity.mockResolvedValue({ ...firstPage, items: [], total: 0 });
    renderAdditions();
    expect(await screen.findByText('—')).toBeVisible();
    expect(screen.queryByText('0 days')).not.toBeInTheDocument();
    expect(screen.getByText('n = 0 · 3 without a valid date')).toBeVisible();
    expect(
      await screen.findByText('No activity in this period.')
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument();
  });

  it('loads additional events with the same cutoff and links interviews before parent applications', async () => {
    activity.mockImplementation(async (query) =>
      query.page === 1
        ? firstPage
        : {
            items: [
              {
                ...event,
                id: 'e2',
                event: 'round.completed',
                round_id: 'round',
              },
            ],
            total: 2,
            page: 2,
            per_page: 1,
          }
    );
    render(
      <MemoryRouter>
        <AnalyticsActivity period="all" />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('Interview completed')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Open record: Interview completed' })
    ).toHaveAttribute('href', '/interviews/round');
    expect(
      screen.getByRole('link', { name: 'Open record: Status changed' })
    ).toHaveAttribute('href', '/applications/app');
    expect(activity.mock.calls[1][0].as_of).toBe(
      activity.mock.calls[0][0].as_of
    );
    expect(
      screen.queryByRole('button', { name: 'Load more' })
    ).not.toBeInTheDocument();
  });

  it('keeps loaded events on a failed next page, then retries only that page', async () => {
    activity
      .mockResolvedValueOnce(firstPage)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({
        items: [{ ...event, id: 'e2' }],
        total: 2,
        page: 2,
        per_page: 1,
      });
    render(
      <MemoryRouter>
        <AnalyticsActivity period="7d" />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Load more' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load activity.'
    );
    expect(screen.getByText('Status changed')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getAllByText('Status changed')).toHaveLength(2)
    );
    expect(activity.mock.calls.map(([query]) => query.page)).toEqual([1, 2, 2]);
  });

  it('loads a fresh first page on period changes and ignores a late old response', async () => {
    let finish!: (page: Page<Activity>) => void;
    activity
      .mockReturnValueOnce(
        new Promise<Page<Activity>>((resolve) => {
          finish = resolve;
        })
      )
      .mockResolvedValueOnce({
        ...firstPage,
        items: [{ ...event, event: 'round.completed' }],
        total: 1,
      });
    const view = render(
      <MemoryRouter>
        <AnalyticsActivity period="7d" />
      </MemoryRouter>
    );
    view.rerender(
      <MemoryRouter>
        <AnalyticsActivity period="30d" />
      </MemoryRouter>
    );
    expect(await screen.findByText('Interview completed')).toBeVisible();
    await act(async () => finish(firstPage));
    expect(screen.queryByText('Status changed')).not.toBeInTheDocument();
    expect(activity.mock.calls.map(([query]) => query.period)).toEqual([
      '7d',
      '30d',
    ]);
  });

  it('does not link deleted companies or expose unrecognized event codes', async () => {
    activity.mockResolvedValue({
      ...firstPage,
      items: [
        {
          ...event,
          event: 'workspace.company.deleted',
          application_id: null,
          target_type: 'company',
          target_id: 'gone',
        },
        { ...event, id: 'other', event: 'private.event' },
      ],
      total: 2,
      per_page: 25,
    });
    render(
      <MemoryRouter>
        <AnalyticsActivity period="all" />
      </MemoryRouter>
    );
    expect(await screen.findByText('Company deleted')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Open record: Company deleted' })
    ).not.toBeInTheDocument();
    expect(screen.getByText('Record updated')).toBeVisible();
    expect(screen.queryByText('private.event')).not.toBeInTheDocument();
  });

  it('shows read errors with a retry button', async () => {
    breakdowns
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(breakdown);
    render(<AnalyticsNewKpis period="all" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load analytics.'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('6.4 days')).toBeVisible();
  });

  it('has matching English and Serbian keys and renders Serbian labels, not user data', async () => {
    expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
    await i18n.changeLanguage('sr-Latn');
    renderAdditions();
    expect(await screen.findByText('6,4 dana')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Po izvoru' })).toBeVisible();
    expect(screen.getByText('Python')).toBeVisible();
    expect(await screen.findByText('Status promenjen')).toBeVisible();
  });
});
