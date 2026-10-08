import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Companies from './Companies';
import Tasks from './Tasks';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    data: { time_zone_mode: 'manual', time_zone: 'UTC' },
  }),
}));
vi.mock('@/lib/apiV030', () => ({
  apiV030: {
    tasks: async () => ({
      items: [],
      total: 0,
      deadlines: [],
      badge: { total: 0, overdue: 0, due_today: 0 },
    }),
    interviews: async () => ({ items: [], total: 0 }),
    reminders: async () => ({ items: [] }),
  },
}));
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
afterEach(cleanup);
it('switches Companies to Contacts using the shared selector', () => {
  render(
    <MemoryRouter initialEntries={['/companies']}>
      <Companies />
    </MemoryRouter>
  );
  expect(screen.getByRole('button', { name: 'New Company' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Contacts' }));
  expect(screen.getByRole('button', { name: 'New Contact' })).toBeDisabled();
  expect(screen.getByPlaceholderText('Search contacts…')).toBeInTheDocument();
});
it('switches Tasks to the month grid and opens the selected week', () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/tasks']}>
        <Tasks />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByRole('radio', { name: 'Open' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Interviews' }));
  expect(
    screen.getByRole('table', { name: 'Interview calendar' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('cell')[0].querySelector('button')!);
  expect(screen.getByRole('radio', { name: 'Week' })).toBeChecked();
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
});
