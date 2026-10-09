import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import DashboardPipelineStrip from './DashboardPipelineStrip';

vi.mock('@/hooks/useDashboardOverview', () => ({
  useDashboardOverview: () => ({
    data: {
      pipeline: [
        { status_id: 'custom', name: 'Custom', count: 3, color: '#123456' },
      ],
    },
    isError: false,
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
afterEach(cleanup);

it('keeps a visible proportional status bar behind a transparent navigation link', () => {
  render(
    <MemoryRouter>
      <DashboardPipelineStrip />
    </MemoryRouter>
  );
  const segment = screen.getByLabelText('Custom 3');
  expect(segment).toHaveAttribute('href', '/applications?status=custom');
  expect(segment).toHaveClass('block', 'h-full');
  expect(segment.style.backgroundColor).toBe('');
  expect(segment.parentElement).toHaveStyle({ backgroundColor: '#123456' });
  expect(segment.parentElement!.style.flexGrow).toBe('3');
  const label = screen
    .getAllByRole('link')
    .find((link) => !link.hasAttribute('aria-label'))!;
  expect(label).toHaveClass('inline-flex', 'items-center');
});
