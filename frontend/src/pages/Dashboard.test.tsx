import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listApplications, useUserPreferences } = vi.hoisted(() => ({
  listApplications: vi.fn(),
  useUserPreferences: vi.fn(),
}));

vi.mock('../lib/applications', () => ({
  listApplications,
}));

vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'test@example.com', is_admin: false },
    loading: false,
    refreshUser: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('../components/slots/DashboardPipelineStrip', () => ({ default: () => null }));
vi.mock('../components/slots/DashboardUpcomingRow', () => ({ default: () => null }));
vi.mock('../components/slots/DashboardBoard', () => ({ default: () => null }));
vi.mock('../components/Layout', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/dashboard/FlameEmblem', () => ({
  default: () => <div>FlameEmblem</div>,
}));

vi.mock('../components/dashboard/KPICards', () => ({
  default: () => <div>KPICards</div>,
}));

vi.mock('../components/dashboard/NeedsAttention', () => ({
  default: () => <div>NeedsAttention</div>,
}));

vi.mock('../components/ActivityHeatmap', () => ({
  default: () => <div>ActivityHeatmap</div>,
}));

vi.mock('../components/ImportModal', () => ({
  default: () => null,
}));

vi.mock('../components/ApplicationModal', () => ({
  default: () => null,
}));

vi.mock('../lib/dashboardPrompt', () => ({
  hasSeenImportPrompt: () => true,
  markImportPromptSeen: vi.fn(),
}));

describe('Dashboard preferences', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    listApplications.mockResolvedValue({ total: 1 });
  });

  it('shows a retry action instead of an empty account after a failed read', async () => {
    listApplications
      .mockRejectedValueOnce(new Error('Offline'))
      .mockResolvedValueOnce({ total: 1 });
    useUserPreferences.mockReturnValue({ data: undefined });
    const { default: Dashboard } = await import('./Dashboard');
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByText(
        'Welcome! Add your first job application to get started.'
      )
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await screen.findByText('KPICards');
  });

  it('hides streak, needs-attention, and heatmap sections when disabled', async () => {
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: false,
        show_needs_attention: false,
        show_heatmap: false,
        time_zone_mode: 'device',
        time_zone: 'Europe/Belgrade',
      },
    });

    const { default: Dashboard } = await import('./Dashboard');

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(listApplications).toHaveBeenCalled());

    expect(screen.queryByText('FlameEmblem')).not.toBeInTheDocument();
    expect(screen.queryByText('NeedsAttention')).not.toBeInTheDocument();
    expect(screen.queryByText('ActivityHeatmap')).not.toBeInTheDocument();
    expect(screen.getByText('KPICards')).toBeInTheDocument();
  });

  it('shows streak, needs-attention, and heatmap sections when enabled', async () => {
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: true,
        time_zone_mode: 'device',
        time_zone: 'Europe/Belgrade',
      },
    });

    const { default: Dashboard } = await import('./Dashboard');

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(listApplications).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText('FlameEmblem')).toBeInTheDocument();
      expect(screen.getByText('NeedsAttention')).toBeInTheDocument();
      expect(screen.getByText('ActivityHeatmap')).toBeInTheDocument();
    });
  });

  it('hides Flame of Focus in the empty dashboard onboarding state', async () => {
    listApplications.mockResolvedValue({ total: 0 });
    useUserPreferences.mockReturnValue({
      data: {
        show_streak_stats: true,
        show_needs_attention: true,
        show_heatmap: true,
        time_zone_mode: 'device',
        time_zone: 'Europe/Belgrade',
      },
    });

    const { default: Dashboard } = await import('./Dashboard');

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    await waitFor(() => expect(listApplications).toHaveBeenCalled());

    expect(screen.queryByText('FlameEmblem')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Welcome! Add your first job application to get started.'
      )
    ).toBeInTheDocument();
  });
});
