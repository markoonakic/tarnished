import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Analytics from './Analytics';
import { queryClient } from '../lib/queryClient';
import type { FeedbackState } from '../hooks/useFeedback';

const { get, post, useUserPreferences } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  useUserPreferences: vi.fn(),
}));
vi.mock('../lib/api', () => ({
  default: { get, post },
  safeErrorMessage: (_: unknown, fallback: string) => fallback,
}));
vi.mock('@/hooks/useUserPreferences', () => ({ useUserPreferences }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'owner', email: 'review@example.test' },
    signOut: vi.fn(),
  }),
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useAnalyticsData', () => ({
  useAnalyticsKPIs: () => ({ isLoading: true }),
  useSankeyAnalytics: () => ({ isLoading: true }),
  useWeeklyActivityData: () => ({ isLoading: true }),
  useInterviewRoundsAnalytics: () => ({ isLoading: true }),
}));
vi.mock('../components/slots/AnalyticsNewKpis', () => ({
  default: () => null,
}));
vi.mock('../components/slots/AnalyticsBreakdowns', () => ({
  default: () => null,
}));
vi.mock('../components/slots/AnalyticsActivity', () => ({
  default: () => null,
}));
vi.mock('../components/ActivityHeatmap', () => ({
  default: () => <div>ActivityHeatmap</div>,
}));
let payload: FeedbackState;
beforeEach(() => {
  queryClient.clear();
  useUserPreferences.mockReturnValue({ data: { show_heatmap: false } });
  get.mockReset();
  post.mockReset();
  payload = {
    capability: {
      available: true,
      configuration_revision: 'rev',
      provider: 'openai',
      model: 'test',
      message: '',
      input_disclosure: '',
      external_processing: '',
    },
    stale_reason: null,
    job: null,
    report: null,
  };
  get.mockImplementation(async () => ({ data: payload }));
  post.mockImplementation(async (_url, body) => {
    payload = {
      ...payload,
      job: {
        id: 'job',
        intent_id: body.intent_id,
        period: body.period,
        state: 'queued',
        uncertain: false,
        error: null,
        completed_sections: 0,
        total_sections: 1,
      },
    };
    return { data: payload.job };
  });
});
afterEach(() => {
  cleanup();
  queryClient.clear();
});

it.each([true, false])(
  'respects the existing activity heatmap setting: %s',
  async (show_heatmap) => {
    useUserPreferences.mockReturnValue({ data: { show_heatmap } });
    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Seek Grace' })).toBeEnabled()
    );
    if (show_heatmap) expect(screen.getByText('ActivityHeatmap')).toBeVisible();
    else expect(screen.queryByText('ActivityHeatmap')).not.toBeInTheDocument();
  }
);

it('keeps every analytics section, reads saved state without POST and uses one explicit Seek Grace action', async () => {
  render(
    <MemoryRouter initialEntries={['/analytics?period=30d']}>
      <Analytics />
    </MemoryRouter>
  );
  for (const title of [
    'Analytics',
    'Pipeline Overview',
    'Interview Analytics',
    'Activity Tracking',
  ])
    expect(screen.getByRole('heading', { name: title })).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Seek Grace' })).toBeEnabled()
  );
  expect(get.mock.calls[0][0]).toBe('/api/analytics/feedback?period=30d');
  expect(post).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Seek Grace' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(
    screen.queryByRole('button', { name: 'Seeking…' })
  ).not.toBeInTheDocument();
  expect(
    await screen.findByText('Waiting to start for Last 30 days…')
  ).toBeVisible();
  fireEvent.click(
    screen.getByRole('button', { name: 'Close pipeline feedback' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'View feedback progress' })
  );
  expect(
    screen.getByRole('region', { name: 'Pipeline feedback' })
  ).toBeVisible();
  expect(post).toHaveBeenCalledTimes(1);
});

it('period changes only read; explicit generation uses the selected period and historical date', async () => {
  render(
    <MemoryRouter
      initialEntries={['/analytics?period=7d&as_of=2026-01-07T09%3A00%3A00Z']}
    >
      <Analytics />
    </MemoryRouter>
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Seek Grace' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await waitFor(() =>
    expect(
      get.mock.calls.some(
        ([url]) =>
          new URL(url, 'http://example.test').searchParams.get('period') ===
          'all'
      )
    ).toBe(true)
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Seek Grace' })).toBeEnabled()
  );
  expect(post).not.toHaveBeenCalled();
  const url = get.mock.calls.at(-1)![0];
  expect(new URL(url, 'http://example.test').searchParams.get('as_of')).toBe(
    '2026-01-07T09:00:00Z'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Seek Grace' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      url,
      expect.objectContaining({
        period: 'all',
        as_of: '2026-01-07T09:00:00Z',
        config_revision: 'rev',
      })
    )
  );
});

it('keeps a starting request visible across a period change and refreshes the current view after acknowledgement', async () => {
  let acknowledge!: () => void;
  const accepted = new Promise<void>((resolve) => {
    acknowledge = resolve;
  });
  post.mockImplementation(async (_url, body) => {
    await accepted;
    payload = {
      ...payload,
      job: {
        id: 'job',
        intent_id: body.intent_id,
        period: body.period,
        state: 'queued',
        uncertain: false,
        error: null,
        completed_sections: 0,
        total_sections: 1,
      },
    };
    return { data: payload.job };
  });
  render(
    <MemoryRouter initialEntries={['/analytics?period=30d']}>
      <Analytics />
    </MemoryRouter>
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Seek Grace' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Seek Grace' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  await waitFor(() =>
    expect(get.mock.calls.some(([url]) => url.endsWith('period=all'))).toBe(
      true
    )
  );
  expect(
    screen.queryByRole('button', { name: 'Seeking…' })
  ).not.toBeInTheDocument();
  expect(screen.getByText('Starting feedback for Last 30 days…')).toBeVisible();
  await act(async () => acknowledge());
  expect(
    await screen.findByText('Waiting to start for Last 30 days…')
  ).toBeVisible();
  expect(post).toHaveBeenCalledTimes(1);
  expect(post.mock.calls[0][1].period).toBe('30d');
});

it('labels the saved pipeline period separately from the current chart selection without regeneration', async () => {
  payload = {
    ...payload,
    stale_reason: 'period changed',
    report: {
      period: 'all',
      as_of: '2026-01-07T09:00:00Z',
      time_zone: 'UTC',
      run_at: '2026-01-08T10:00:00Z',
      provider: 'openai',
      model: 'test',
      findings: [],
      sources: [],
      limitations: [],
      coverage: { sections: 1, sources: 1, characters: 10 },
    },
  };
  render(
    <MemoryRouter initialEntries={['/analytics?period=7d']}>
      <Analytics />
    </MemoryRouter>
  );
  expect(
    await screen.findByText('Saved feedback is for All time.')
  ).toBeVisible();
  expect(
    screen.queryByText(/may be out of date|Saved feedback:|Feedback ready/)
  ).not.toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});
