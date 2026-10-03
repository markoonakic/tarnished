import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import AnalyticsKPIs from './AnalyticsKPIs';
import { queryClient } from '../../lib/queryClient';
import api from '../../lib/api';

vi.mock('@/hooks/useEffectiveDayKey', () => ({
  useEffectiveDayKey: () => '2026-10-01',
}));
vi.mock('./StageResidence', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  queryClient.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('clears an Analytics card error after focus refetch, without a click or a write', async () => {
  vi.useFakeTimers();
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
  const post = vi.spyOn(api, 'post');
  render(
    <QueryClientProvider client={queryClient}>
      <AnalyticsKPIs period="30d" />
    </QueryClientProvider>
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(7100);
  });
  expect(screen.getByText('Failed to load KPIs')).toBeVisible();
  expect(get).toHaveBeenCalledTimes(4);
  get.mockResolvedValue({
    data: {
      scope: { cohort_start: null, cohort_end: null },
      total_applications: 12,
      interviews: 3,
      offers: 1,
      interview_rate: 25,
      response_rate: 50,
      responded: 6,
      response_unknown: 0,
      active_opportunities: 4,
    },
  });
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10);
  });
  expect(screen.queryByText('Failed to load KPIs')).not.toBeInTheDocument();
  expect(screen.getByText('Total Applications')).toBeVisible();
  expect(screen.getByText('12')).toBeVisible();
  expect(get).toHaveBeenCalledTimes(5);
  expect(post).not.toHaveBeenCalled();
});
