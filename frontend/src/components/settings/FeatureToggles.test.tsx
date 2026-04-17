import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useUserPreferences, useUpdateUserPreferences } = vi.hoisted(() => ({
  useUserPreferences: vi.fn(),
  useUpdateUserPreferences: vi.fn(),
}));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences,
  useUpdateUserPreferences,
}));

describe('FeatureToggles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders loaded preferences and sends the correct toggle update', async () => {
    let currentPreferences = {
      show_streak_stats: true,
      show_needs_attention: true,
      show_heatmap: true,
      time_zone_mode: 'device',
      time_zone: 'Europe/Belgrade',
    };

    const mutate = vi.fn((updates: Partial<typeof currentPreferences>) => {
      currentPreferences = {
        ...currentPreferences,
        ...updates,
      };
    });

    useUserPreferences.mockImplementation(() => ({
      data: currentPreferences,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    }));
    useUpdateUserPreferences.mockImplementation(() => ({
      mutate,
      isPending: false,
    }));

    const { default: FeatureToggles } = await import('./FeatureToggles');
    const { rerender } = render(<FeatureToggles />);

    const heatmapToggle = screen.getByRole('switch', {
      name: /show activity heatmap/i,
    });
    expect(heatmapToggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText('Visible')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();

    fireEvent.click(heatmapToggle);

    expect(mutate).toHaveBeenCalledWith({ show_heatmap: false });

    rerender(<FeatureToggles />);

    expect(
      screen.getByRole('switch', { name: /show activity heatmap/i })
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('shows a retry state when feature settings fail to load', async () => {
    const refetch = vi.fn();

    useUserPreferences.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });
    useUpdateUserPreferences.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });

    const { default: FeatureToggles } = await import('./FeatureToggles');
    render(<FeatureToggles />);

    expect(
      screen.getByText('Failed to load feature settings.')
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });
});
