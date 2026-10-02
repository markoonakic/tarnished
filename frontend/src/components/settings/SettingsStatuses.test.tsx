import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import SettingsStatuses from './SettingsStatuses';
import { createStatus, updateStatus } from '@/lib/settings';
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/lib/settings', () => ({
  listStatuses: vi.fn().mockResolvedValue([
    {
      id: 'personal',
      name: 'Custom',
      meaning: 'rejected',
      color: '#ffffff',
      is_default: false,
    },
  ]),
  createStatus: vi.fn().mockResolvedValue({}),
  updateStatus: vi.fn().mockResolvedValue({}),
  deleteStatus: vi.fn(),
}));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
it('exposes stable meaning and sends explicitly selected semantics for a custom label', async () => {
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  expect(screen.getByText('Stage: Rejected')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Add' })).toHaveClass('h-10');
  expect(screen.getByPlaceholderText('New status name')).toHaveClass('h-10');
  expect(
    screen.getByPlaceholderText('New status name').closest('form')
  ).toHaveClass('items-end');
  fireEvent.change(screen.getByPlaceholderText('New status name'), {
    target: { value: 'Different label' },
  });
  fireEvent.click(screen.getByRole('combobox', { name: 'Stage' }));
  fireEvent.click(screen.getByRole('option', { name: 'Offer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  await waitFor(() =>
    expect(createStatus).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Different label', meaning: 'offer' })
    )
  );
});
it('a label-only rename preserves the selected definition meaning rather than inferring it from text', async () => {
  render(
    <MemoryRouter>
      <SettingsStatuses />
    </MemoryRouter>
  );
  await screen.findByText('Custom');
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('h-10');
  expect(screen.getByPlaceholderText('Status name').parentElement).toHaveClass(
    'items-end'
  );
  fireEvent.change(screen.getByPlaceholderText('Status name'), {
    target: { value: 'Offer' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() =>
    expect(updateStatus).toHaveBeenCalledWith('personal', {
      name: 'Offer',
      meaning: 'rejected',
      color: '#ffffff',
    })
  );
});
