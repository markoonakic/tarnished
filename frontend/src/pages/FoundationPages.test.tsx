import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Companies from './Companies';
import Tasks from './Tasks';
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
    <MemoryRouter initialEntries={['/tasks']}>
      <Tasks />
    </MemoryRouter>
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
