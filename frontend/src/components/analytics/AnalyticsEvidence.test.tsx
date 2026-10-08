import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import api from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import type { AnalyticsKPIs as Metrics } from '@/lib/analytics';
import AnalyticsKPIs from './AnalyticsKPIs';
import StageResidence from './StageResidence';
import i18n from '@/lib/i18n';
import InterviewTimeline from './InterviewTimeline';
import InterviewOutcomes from './InterviewOutcomes';
import SankeyChart from '../SankeyChart';
const { chart } = vi.hoisted(() => ({ chart: vi.fn() }));
vi.mock('echarts-for-react', () => ({
  default: (props: unknown) => {
    chart(props);
    return <div data-testid="chart" />;
  },
}));
vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => 'UTC:2026-01-07',
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
const scope = {
  period: 'all',
  cohort_start: null,
  cohort_end: '2026-01-07',
  as_of: '2026-01-07T09:00:00Z',
  time_zone: 'UTC',
  denominator: 10,
  basis: 'applied_date_cohort',
};
const metrics: Metrics = {
  scope,
  current_record_basis: {
    observed_at: '2026-06-01T09:00:00Z',
    basis: 'live_current_records_not_historical_as_of',
  },
  total_applications: 10,
  responded: 4,
  response_rate: 40,
  response_unknown: 0,
  response_undated: 1,
  response_not_recorded_as_of: 6,
  interviews: 2,
  offers: 1,
  interview_rate: 20,
  offer_rate: 10,
  active_applications: 9,
  closed_applications: 1,
  unknown_applications: 0,
  current_stage_breakdown: {
    applied: 6,
    screening: 1,
    interviewing: 1,
    offer: 1,
    rejected: 1,
  },
  stage_breakdown: {},
  applications: [
    {
      application_id: 'A',
      company: 'Synthetic A',
      job_title: 'Role',
      applied_at: '2026-01-01',
      evidence_revision: 0,
      current_meaning: 'interviewing',
      as_of_meaning: 'interviewing',
      response_recorded: true,
      response_state: 'recorded',
      response_occurred_on: null,
      response_recorded_at: '2026-01-02T09:00:00Z',
      current_stage_age_hours: 24,
      missing_prefix: false,
      gap_ids: [],
      unknown_history_ids: [],
      ambiguous_time_ids: [],
    },
  ],
  visits: [
    {
      application_id: 'A',
      entry_id: '1',
      exit_id: '2',
      meaning: 'applied',
      entered_at: '2026-01-01T09:00:00Z',
      ended_at: '2026-01-03T09:00:00Z',
      kind: 'completed',
      hours: 48,
      reason: null,
    },
    {
      application_id: 'A',
      entry_id: '2',
      exit_id: '3',
      meaning: 'screening',
      entered_at: '2026-01-03T09:00:00Z',
      ended_at: '2026-01-04T09:00:00Z',
      kind: 'completed',
      hours: 24,
      reason: null,
    },
    {
      application_id: 'A',
      entry_id: '3',
      exit_id: '4',
      meaning: 'applied',
      entered_at: '2026-01-04T09:00:00Z',
      ended_at: '2026-01-06T09:00:00Z',
      kind: 'completed',
      hours: 48,
      reason: null,
    },
    {
      application_id: 'A',
      entry_id: '4',
      exit_id: null,
      meaning: 'interviewing',
      entered_at: '2026-01-06T09:00:00Z',
      ended_at: null,
      kind: 'current',
      hours: 24,
      reason: null,
    },
  ],
  stage_totals: [
    { application_id: 'A', meaning: 'applied', hours: 96 },
    { application_id: 'A', meaning: 'screening', hours: 24 },
    { application_id: 'A', meaning: 'interviewing', hours: 24 },
  ],
  coverage: {
    applications_with_measured_residence: 1,
    applications_with_gaps: 0,
    applications_with_unknown_history: 0,
    applications_with_missing_prefix: 0,
    active_age_unavailable: 0,
  },
  application_to_interview_rate: 20,
  active_opportunities: 9,
};
it('translates stage meanings in residence tables and wait labels, not record names', async () => {
  await i18n.changeLanguage('sr-Latn');
  mount(
    <StageResidence
      metrics={{
        ...metrics,
        applications: [{ ...metrics.applications[0], company: 'Applied' }],
      }}
    />
  );
  expect(screen.getByText('Poslata')).toBeVisible();
  expect(screen.getByText('Preliminarni razgovor')).toBeVisible();
  expect(
    screen.getByRole('link', { name: /Applied · Role, Intervju/ })
  ).toBeVisible();
});

const originalAdapter = api.defaults.adapter;
beforeEach(() => {
  queryClient.clear();
  chart.mockClear();
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
  queryClient.clear();
  api.defaults.adapter = originalAdapter;
});
function mount(node: React.ReactNode) {
  render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
    </MemoryRouter>
  );
}
it('keeps correct counts, rates, measured averages and current waits in the compact layout', async () => {
  api.defaults.adapter = async (config) => {
    expect(config.params).toEqual({ period: 'all', as_of: scope.as_of });
    return {
      data: metrics,
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  mount(<AnalyticsKPIs period="all" asOf={scope.as_of} />);
  await screen.findByText('40%');
  expect(screen.getByText('20%')).toBeVisible();
  expect(
    within(screen.getByText('Interviews').parentElement!).getByText('2')
  ).toBeVisible();
  expect(
    within(screen.getByText('Offers').parentElement!).getByText('1')
  ).toBeVisible();
  expect(
    within(screen.getByText('Active Opportunities').parentElement!).getByText(
      '9'
    )
  ).toBeVisible();
  fireEvent.focus(
    screen.getByRole('button', { name: 'About pipeline metrics' })
  );
  expect(await screen.findByRole('tooltip')).toHaveTextContent(
    /Rates use 10 applications; saved leads are excluded/
  );
  const applied = screen.getByRole('row', { name: 'Applied 2d 2' });
  expect(applied).toBeVisible(); // (48 + 48) hours / 2 completed visits
  expect(
    screen.getByRole('link', { name: 'Synthetic A · Role, Interviewing, 1d' })
  ).toHaveAttribute('href', '/applications/A');
  expect(
    screen.queryByText(/Current classification|Evidence through as-of/)
  ).not.toBeInTheDocument();
});
it('labels zero denominators unavailable instead of meaningful percentages', async () => {
  api.defaults.adapter = async (config) => ({
    data: {
      ...metrics,
      scope: { ...scope, denominator: 0 },
      total_applications: 0,
      responded: 0,
      interviews: 0,
      offers: 0,
      response_rate: null,
      interview_rate: null,
      offer_rate: null,
      applications: [],
      visits: [],
      stage_totals: [],
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  mount(<AnalyticsKPIs period="all" />);
  expect(await screen.findAllByText('—')).toHaveLength(2);
  expect(screen.queryByText('0%')).not.toBeInTheDocument();
});
it('groups chart identity separately from labels, retains repeats and uses text tooltips', async () => {
  const nodes = ['event1', 'event2', 'gap'].map((id) => ({
    id,
    name: id === 'gap' ? 'Evidence gap' : '<img src=x onerror=alert(1)>',
    meaning: id === 'gap' ? 'unknown' : 'applied',
    application_id: 'A',
    entered_at: scope.as_of,
    value: 1,
  }));
  api.defaults.adapter = async (config) => ({
    data: {
      scope,
      nodes,
      links: [{ source: 'event1', target: 'event2', value: 1 }],
      coverage: metrics.coverage,
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  mount(<SankeyChart period="all" asOf={scope.as_of} />);
  await waitFor(() => expect(chart).toHaveBeenCalled());
  const option = chart.mock.lastCall![0].option;
  const plotted = option.series[0].data;
  expect(plotted).toHaveLength(3);
  expect(new Set(plotted.map((node: { name: string }) => node.name)).size).toBe(
    3
  );
  expect(option.series[0].links).toEqual([
    { source: plotted[0].name, target: plotted[1].name, value: 1 },
  ]);
  expect(option.tooltip.renderMode).toBe('richText');
  expect(option.tooltip.formatter({ name: plotted[2].name })).toContain(
    'Evidence gap'
  );
  expect(option.series[0].label.formatter({ name: plotted[0].name })).toBe(
    '<img src=x onerror=alert(1)>'
  );
});
it('shows short durations with precise values and keeps the axis name below the chart', async () => {
  api.defaults.adapter = async (config) => ({
    data: {
      scope,
      timeline_data: [
        { round: 'Phone', avg_days: 0, avg_hours: 25 / 60 },
        { round: 'Technical', avg_days: 0, avg_hours: 50 / 60 },
        { round: 'Onsite', avg_days: 0.1, avg_hours: 2.4 },
      ],
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  mount(<InterviewTimeline />);
  await waitFor(() => expect(chart).toHaveBeenCalled());
  const option = chart.mock.lastCall![0].option;
  expect(option.series[0].data[0]).toBeCloseTo(25 / 1440);
  expect(chart.mock.lastCall![0].style.minWidth).toBe('36rem');
  expect(option.xAxis.nameLocation).toBe('middle');
  expect(option.xAxis.nameGap).toBe(35);
  expect(option.grid.bottom).toBe(65);
  const label = option.series[0].label.formatter;
  expect(label({ value: 25 / 1440 })).toBe('25 min');
  expect(label({ value: 50 / 1440 })).toBe('50 min');
  expect(label({ value: 0.1 })).toBe('2.4 h');
  expect(label({ value: 0.00001 })).toBe('<1 min');
  expect(
    option.tooltip.formatter([{ name: 'Phone', value: 25 / 1440 }])
  ).toContain('25 min');
});

it('hides inside labels that do not fit their segments and keeps the Withdrawn display wording', async () => {
  api.defaults.adapter = async (config) => ({
    data: {
      scope,
      outcome_data: [
        { round: 'Final', passed: 1, failed: 4, pending: 0, withdrew: 1 },
      ],
    },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
  mount(<InterviewOutcomes />);
  await waitFor(() => expect(chart).toHaveBeenCalled());
  const option = chart.mock.lastCall![0].option;
  expect(chart.mock.lastCall![0].style.minWidth).toBe('36rem');
  expect(option.legend.data).toContain('Withdrawn');
  for (const series of option.series) {
    expect(
      series.labelLayout({ rect: { width: 20 }, labelRect: { width: 60 } })
    ).toEqual({ hideOverlap: true, width: 0 });
    expect(
      series.labelLayout({ rect: { width: 100 }, labelRect: { width: 60 } })
    ).toEqual({ hideOverlap: true, width: undefined });
    expect(series.data[0].label.overflow).toBe('truncate');
    expect(series.data[0].label.ellipsis).toBe('');
  }
  expect(option.series[3].data[0].value).toBe(1);
  expect(
    option.tooltip.formatter([
      { name: 'Final', seriesName: 'Passed', value: 1 },
      { name: 'Final', seriesName: 'Failed', value: 4 },
      { name: 'Final', seriesName: 'Withdrawn', value: 1 },
    ])
  ).toContain('Passed: 1 (17%)');
});

it.each([true, false])(
  'does not turn missing round dates into zero durations: %s',
  async (hasMeasured) => {
    const round = (round_type: string, days_in_round: number | null) => ({
      round_type,
      days_in_round,
      outcome: null,
      scheduled_at: days_in_round === null ? null : scope.as_of,
      completed_at: days_in_round === null ? null : scope.as_of,
    });
    api.defaults.adapter = async (config) => ({
      data: {
        scope,
        duration_basis: 'scheduled_to_completed',
        timeline_data: hasMeasured ? [{ round: 'Phone', avg_days: 0 }] : [],
        candidate_progress: [
          {
            application_id: 'A',
            candidate_name: 'Synthetic A',
            role: 'Role',
            current_status: 'applied',
            rounds_completed: [
              round('Phone', hasMeasured ? 0 : null),
              round('Technical', null),
              round('Technical', null),
            ],
          },
          {
            application_id: 'B',
            candidate_name: 'Synthetic B',
            role: 'Role',
            current_status: 'applied',
            rounds_completed: [round('Phone', null), round('Technical', null)],
          },
        ],
        funnel_data: [],
        outcome_data: [],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    mount(<InterviewTimeline asOf={scope.as_of} />);
    expect(await screen.findByText(/Interview duration/)).toBeVisible();
    fireEvent.focus(
      screen.getByRole('button', { name: 'About interview duration' })
    );
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      /Average days from the scheduled interview/
    );
    expect(screen.queryByText(/Denominator:/)).not.toBeInTheDocument();
    if (hasMeasured) {
      await waitFor(() => expect(chart).toHaveBeenCalled());
      const option = chart.mock.lastCall![0].option;
      expect(option.yAxis.data).toEqual(['Phone']);
      expect(option.series[0].data).toEqual([0]);
    } else {
      expect(
        screen.getByText('No measured interview durations available')
      ).toBeVisible();
      expect(chart).not.toHaveBeenCalled();
    }
  }
);
