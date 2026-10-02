import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSankeyAnalytics } from '@/hooks/useAnalyticsData';
import type { SankeyData } from '@/lib/analytics';
import SankeyChart from './SankeyChart';

// Keep the installed ECharts renderer real; linkless evidence must never reach it.
vi.mock('@/hooks/useAnalyticsData', () => ({ useSankeyAnalytics: vi.fn() }));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
afterEach(cleanup);

it.each([1, 3])(
  'handles %i disconnected observations without inventing paths or rendering invalid SVG',
  (count) => {
    const data: SankeyData = {
      scope: {
        period: 'all',
        cohort_start: null,
        cohort_end: '2026-01-07',
        as_of: '2026-01-07T09:00:00Z',
        time_zone: 'UTC',
        denominator: count,
        basis: 'applied_date_cohort',
      },
      coverage: {},
      nodes: Array.from({ length: count }, (_, index) => ({
        id: `event-${index}`,
        application_id: `application-${index}`,
        name: '<img src=x onerror=alert(1)>',
        meaning: 'applied',
        entered_at: '2026-01-07T09:00:00Z',
        value: 1,
      })),
      links: [],
    };
    vi.mocked(useSankeyAnalytics).mockReturnValue({
      data,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSankeyAnalytics>);
    const { container } = render(<SankeyChart />);
    expect(screen.getByText('No status changes to plot yet')).toBeVisible();
    expect(
      screen.queryByText(/application-0|Boundary:/)
    ).not.toBeInTheDocument();
    expect(container.querySelector('svg, canvas, img')).toBeNull();
    expect(data.links).toEqual([]);
  }
);
