import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { useUserPreferences, useUpdateUserPreferences, getBrowserTimeZone } =
  vi.hoisted(() => ({
    useUserPreferences: vi.fn(),
    useUpdateUserPreferences: vi.fn(),
    getBrowserTimeZone: vi.fn(),
  }));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences,
  useUpdateUserPreferences,
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    getBrowserTimeZone,
  };
});

describe('TimeZoneSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBrowserTimeZone.mockReturnValue('Europe/Belgrade');
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the browser timezone in device mode and can switch to manual', async () => {
    const mutate = vi.fn();
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: true,
        time_zone_mode: 'device',
        time_zone: null,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useUpdateUserPreferences.mockReturnValue({
      mutate,
      isPending: false,
    });

    const { default: TimeZoneSettings } = await import('./TimeZoneSettings');
    render(<TimeZoneSettings />);

    const input = screen.getByRole('combobox', { name: /time zone/i });
    expect(input).toHaveValue('Europe/Belgrade · Use device time zone');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Belgrade' } });
    fireEvent.click(screen.getByRole('option', { name: 'Europe/Belgrade' }));

    expect(mutate).toHaveBeenCalledWith({
      time_zone_mode: 'manual',
      time_zone: 'Europe/Belgrade',
    });
  });

  it('updates the manual time zone when selected', async () => {
    const mutate = vi.fn();
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: true,
        time_zone_mode: 'manual',
        time_zone: 'America/New_York',
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    useUpdateUserPreferences.mockReturnValue({
      mutate,
      isPending: false,
    });

    const { default: TimeZoneSettings } = await import('./TimeZoneSettings');
    render(<TimeZoneSettings />);

    const manualTimeZoneInput = screen.getByRole('combobox', {
      name: /time zone/i,
    });
    fireEvent.focus(manualTimeZoneInput);
    fireEvent.change(manualTimeZoneInput, {
      target: { value: 'los' },
    });
    fireEvent.click(
      screen.getByRole('option', { name: 'America/Los_Angeles' })
    );

    expect(mutate).toHaveBeenCalledWith({
      time_zone_mode: 'manual',
      time_zone: 'America/Los_Angeles',
    });
  });
});
