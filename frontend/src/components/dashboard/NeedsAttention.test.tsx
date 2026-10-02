import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NeedsAttention from './NeedsAttention';

const { useNeedsAttentionData } = vi.hoisted(() => ({
  useNeedsAttentionData: vi.fn(),
}));
vi.mock('@/hooks/useDashboardData', () => ({ useNeedsAttentionData }));
afterEach(cleanup);

describe('NeedsAttention', () => {
  it('keeps reminders compact and links to the application', () => {
    useNeedsAttentionData.mockReturnValue({
      data: {
        follow_ups: [],
        no_responses: [
          {
            id: 'application-1',
            company: 'Northwind Analytics',
            job_title: 'Senior Backend Engineer',
            days_since: 12,
            reason: 'no_recorded_response',
            current_stage_age_hours: null,
          },
        ],
        interviewing: [],
      },
    });
    render(
      <MemoryRouter>
        <NeedsAttention />
      </MemoryRouter>
    );
    expect(
      screen.getByRole('button', {
        name: 'Northwind Analytics Senior Backend Engineer 12d since applied',
      })
    ).toBeInTheDocument();
    expect(screen.getByText('Awaiting Response')).toBeInTheDocument();
    expect(
      screen.queryByText(/as-of|cohort|no_recorded_response/)
    ).not.toBeInTheDocument();
  });

  it('distinguishes unavailable reminders from an empty list', () => {
    useNeedsAttentionData.mockReturnValue({ isError: true });
    render(
      <MemoryRouter>
        <NeedsAttention />
      </MemoryRouter>
    );
    expect(
      screen.getByText('Failed to load items needing attention')
    ).toBeInTheDocument();
    expect(screen.queryByText('No pending reminders')).not.toBeInTheDocument();
  });
});
