import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SettingsRoundTypes from './SettingsRoundTypes';
import { createRoundType, updateRoundType } from '@/lib/settings';
vi.mock('@/lib/settings', () => ({
  listRoundTypes: vi
    .fn()
    .mockResolvedValue([
      { id: 'custom', name: 'W'.repeat(180), is_default: false },
    ]),
  createRoundType: vi.fn().mockResolvedValue({}),
  updateRoundType: vi.fn().mockResolvedValue({}),
  deleteRoundType: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
const show = () =>
  render(
    <MemoryRouter>
      <SettingsRoundTypes />
    </MemoryRouter>
  );
it('guards a pending create against double-submit and repeated Enter', async () => {
  vi.mocked(createRoundType).mockImplementationOnce(
    () => new Promise(() => {})
  );
  show();
  const name = await screen.findByPlaceholderText('New round type name');
  fireEvent.change(name, { target: { value: 'Single create' } });
  fireEvent.submit(name.closest('form')!);
  fireEvent.submit(name.closest('form')!);
  expect(createRoundType).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
});
it('sends the original name and keeps a stale edit after conflict', async () => {
  vi.mocked(updateRoundType).mockRejectedValueOnce({
    isAxiosError: true,
    response: { status: 409 },
  });
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByPlaceholderText('Round type name'), {
    target: { value: 'Retained draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(
    'Settings changed. Reload and review before retrying.'
  );
  expect(updateRoundType).toHaveBeenCalledWith('custom', {
    name: 'Retained draft',
    expected_name: 'W'.repeat(180),
  });
  expect(screen.getByPlaceholderText('Round type name')).toHaveValue(
    'Retained draft'
  );
});
it('wraps unbroken long names without shrinking the action column or forcing a wide input', async () => {
  show();
  expect(await screen.findByText('W'.repeat(180))).toHaveClass(
    'min-w-0',
    '[overflow-wrap:anywhere]'
  );
  expect(
    screen.getByRole('button', { name: 'Edit' }).parentElement
  ).toHaveClass('shrink-0');
  expect(screen.getByPlaceholderText('New round type name')).toHaveClass(
    'min-w-0'
  );
});
