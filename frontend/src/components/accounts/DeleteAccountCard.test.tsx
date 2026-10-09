import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DeleteAccountCard from './DeleteAccountCard';
import { apiV030, type Account } from '@/lib/apiV030';
const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut }) }));
vi.mock('@/lib/apiV030', () => ({
  apiV030: { account: vi.fn(), deleteAccount: vi.fn() },
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiV030.account).mockResolvedValue({
    can_delete_account: true,
  } as Account);
  vi.mocked(apiV030.deleteAccount).mockResolvedValue({} as never);
});
afterEach(cleanup);
it('requires password and explicit confirmation before deletion and signs out', async () => {
  render(<DeleteAccountCard />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Delete account' }));
  expect(
    dialog.getByRole('button', { name: 'Delete permanently' })
  ).toBeDisabled();
  fireEvent.change(dialog.getByLabelText('Current password'), {
    target: { value: 'local-password' },
  });
  expect(
    dialog.getByRole('button', { name: 'Delete permanently' })
  ).toBeDisabled();
  fireEvent.click(dialog.getByRole('checkbox'));
  fireEvent.click(dialog.getByRole('button', { name: 'Delete permanently' }));
  await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
  expect(apiV030.deleteAccount).toHaveBeenCalledWith('local-password', true);
});
it('disables deletion for the last active administrator', async () => {
  vi.mocked(apiV030.account).mockResolvedValue({
    can_delete_account: false,
  } as Account);
  render(<DeleteAccountCard />);
  expect(
    await screen.findByTitle(/You are the only administrator/)
  ).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Delete account' })).toBeDisabled();
  expect(apiV030.deleteAccount).not.toHaveBeenCalled();
});
it('keeps confirmation and password after a failed delete', async () => {
  vi.mocked(apiV030.deleteAccount).mockRejectedValue(new Error('offline'));
  render(<DeleteAccountCard />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Delete account' })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Current password'), {
    target: { value: 'local-password' },
  });
  fireEvent.click(dialog.getByRole('checkbox'));
  fireEvent.click(dialog.getByRole('button', { name: 'Delete permanently' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent(
    'Could not delete'
  );
  expect(dialog.getByLabelText('Current password')).toHaveValue(
    'local-password'
  );
  expect(dialog.getByRole('checkbox')).toBeChecked();
  expect(signOut).not.toHaveBeenCalled();
});
