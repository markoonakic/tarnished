import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Admin from './Admin';
import { listUsers, getAdminStats, deleteUser } from '@/lib/admin';
import { apiV030 } from '@/lib/apiV030';
vi.mock('@/components/Layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/components/CreateUserModal', () => ({ default: () => null }));
vi.mock('@/components/EditUserModal', () => ({ default: () => null }));
vi.mock('@/lib/admin', () => ({
  listUsers: vi.fn(),
  getAdminStats: vi.fn(),
  deleteUser: vi.fn(),
}));
vi.mock('@/lib/apiV030', () => ({ apiV030: { approveUser: vi.fn() } }));
vi.mock('@/lib/aiSettings', () => ({
  getAISettings: async () => ({ text_enabled: false, speech_enabled: false }),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listUsers).mockResolvedValue({
    items: [
      {
        id: 'new',
        email: 'new@example.com',
        is_admin: false,
        is_active: false,
        approval_pending: true,
        last_login_at: null,
        created_at: '2026-10-08T10:00:00Z',
      },
    ],
    total: 1,
    page: 1,
    per_page: 25,
    total_pages: 1,
  });
  vi.mocked(getAdminStats).mockResolvedValue({
    total_users: 2,
    total_applications: 5,
    pending_users: 1,
    applications_by_status: [],
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('shows pending count, last login and server filter chips', async () => {
  render(<Admin />);
  expect(await screen.findByText('Sign-up requests')).toBeVisible();
  expect(
    screen.getByRole('columnheader', { name: 'Last login' })
  ).toBeVisible();
  expect(within(screen.getByRole('table')).getByText('Never')).toBeVisible();
  fireEvent.click(screen.getByRole('radio', { name: 'Pending (1)' }));
  await waitFor(() =>
    expect(listUsers).toHaveBeenLastCalledWith({
      page: 1,
      per_page: 25,
      query: undefined,
      state: 'pending',
    })
  );
});
it('approves pending users with the API approval contract', async () => {
  render(<Admin />);
  await screen.findByRole('table');
  fireEvent.click(
    within(screen.getByRole('table')).getByRole('button', { name: 'Approve' })
  );
  await waitFor(() => expect(apiV030.approveUser).toHaveBeenCalledWith('new'));
});
it('rejects only after confirmation', async () => {
  vi.spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  render(<Admin />);
  await screen.findByRole('table');
  const button = within(screen.getByRole('table')).getByRole('button', {
    name: 'Reject',
  });
  fireEvent.click(button);
  expect(deleteUser).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() => expect(deleteUser).toHaveBeenCalledWith('new'));
});
