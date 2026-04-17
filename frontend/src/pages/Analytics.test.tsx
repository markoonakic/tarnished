import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useUserPreferences, useGraceInsights, toastError } = vi.hoisted(() => ({
  useUserPreferences: vi.fn(),
  useGraceInsights: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences,
}));

vi.mock('@/hooks/useGraceInsights', () => ({
  useGraceInsights,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    error: toastError,
  }),
}));

vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/analytics/PeriodSelector', () => ({
  default: () => <div>PeriodSelector</div>,
}));

vi.mock('../components/analytics/AnalyticsKPIs', () => ({
  default: () => <div>AnalyticsKPIs</div>,
}));

vi.mock('../components/analytics/WeeklyActivityChart', () => ({
  default: () => <div>WeeklyActivityChart</div>,
}));

vi.mock('../components/ActivityHeatmap', () => ({
  default: () => <div>ActivityHeatmap</div>,
}));

vi.mock('../components/SankeyChart', () => ({
  default: () => <div>SankeyChart</div>,
}));

vi.mock('../components/analytics/InterviewFunnel', () => ({
  default: () => <div>InterviewFunnel</div>,
}));

vi.mock('../components/analytics/InterviewOutcomes', () => ({
  default: () => <div>InterviewOutcomes</div>,
}));

vi.mock('../components/analytics/InterviewTimeline', () => ({
  default: () => <div>InterviewTimeline</div>,
}));

vi.mock('@/components/analytics/SeekGraceButton', () => ({
  SeekGraceButton: () => <div>SeekGraceButton</div>,
}));

vi.mock('@/components/analytics/OverallGrace', () => ({
  OverallGrace: () => <div>OverallGrace</div>,
}));

vi.mock('@/components/analytics/SectionInsight', () => ({
  SectionInsight: () => <div>SectionInsight</div>,
}));

describe('Analytics preferences', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    useGraceInsights.mockReturnValue({
      configured: false,
      loading: false,
      insights: null,
      error: null,
      seekGrace: vi.fn(),
    });
  });

  it('hides the activity heatmap when disabled', async () => {
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: false,
        time_zone_mode: 'device',
        time_zone: 'Europe/Belgrade',
      },
    });

    const { default: Analytics } = await import('./Analytics');

    render(
      <MemoryRouter initialEntries={['/analytics?period=7d']}>
        <Analytics />
      </MemoryRouter>
    );

    expect(screen.getByText('WeeklyActivityChart')).toBeInTheDocument();
    expect(screen.queryByText('ActivityHeatmap')).not.toBeInTheDocument();
  });

  it('shows the activity heatmap when enabled', async () => {
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: true,
        time_zone_mode: 'device',
        time_zone: 'Europe/Belgrade',
      },
    });

    const { default: Analytics } = await import('./Analytics');

    render(
      <MemoryRouter initialEntries={['/analytics?period=7d']}>
        <Analytics />
      </MemoryRouter>
    );

    expect(screen.getByText('WeeklyActivityChart')).toBeInTheDocument();
    expect(screen.getByText('ActivityHeatmap')).toBeInTheDocument();
  });
});
