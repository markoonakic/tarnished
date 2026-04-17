import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useDashboardKPIs } = vi.hoisted(() => ({
  useDashboardKPIs: vi.fn(),
}));

vi.mock('@/hooks/useDashboardData', () => ({
  useDashboardKPIs,
}));

describe('KPICards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders positive, new, and neutral trend states correctly', async () => {
    useDashboardKPIs.mockReturnValue({
      data: {
        last_7_days: 3,
        last_7_days_trend: 50,
        last_30_days: 6,
        last_30_days_trend: null,
        active_opportunities: 5,
      },
      isLoading: false,
      isError: false,
    });

    const { default: KPICards } = await import('./KPICards');
    render(<KPICards />);

    expect(screen.getByText('↑ 50%')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByText('Active Opportunities')).toBeInTheDocument();
  });

  it('renders flat trends without an up arrow', async () => {
    useDashboardKPIs.mockReturnValue({
      data: {
        last_7_days: 0,
        last_7_days_trend: 0,
        last_30_days: 0,
        last_30_days_trend: 0,
        active_opportunities: 0,
      },
      isLoading: false,
      isError: false,
    });

    const { default: KPICards } = await import('./KPICards');
    render(<KPICards />);

    expect(screen.getAllByText('0%')).toHaveLength(2);
    expect(screen.queryByText('↑ 0%')).not.toBeInTheDocument();
  });
});
