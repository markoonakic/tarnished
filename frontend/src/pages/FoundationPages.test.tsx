import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { apiV030 } from '@/lib/apiV030';
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('switches Companies to Contacts using the shared selector', () => {
  vi.spyOn(apiV030, 'companies').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  vi.spyOn(apiV030, 'contacts').mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    per_page: 25,
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/companies']}>
        <Companies />
      </MemoryRouter>
    </QueryClientProvider>
  );
  expect(screen.getByRole('button', { name: 'New Company' })).toBeEnabled();
  fireEvent.click(screen.getByRole('radio', { name: 'Contacts' }));
  expect(screen.getByRole('button', { name: 'New Contact' })).toBeEnabled();
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
