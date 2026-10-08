import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsSecurity from './SettingsSecurity';
import api from '../../lib/api';

const signOut = vi.fn();
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ signOut }) }));
vi.mock('../../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api')>()),
  default: { post: vi.fn(), get: vi.fn() },
}));

function form(password = 'synthetic new password') {
  render(
    <MemoryRouter>
      <SettingsSecurity />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'legacy' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: password },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { can_delete_account: true } });
});

describe('SettingsSecurity', () => {
  it.each(['x', ' ', 'x'.repeat(64), '😀'.repeat(50)])(
    'changes an accepted password then clears the browser session',
    async (password) => {
      vi.mocked(api.post).mockResolvedValue({});
      form(password);
      expect(screen.queryByText(/Use at (least|most)/)).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole('button', { name: 'Change password and sign out' })
      );
      await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
      expect(api.post).toHaveBeenCalledWith('/api/auth/change-password', {
        current_password: 'legacy',
        new_password: password,
      });
    }
  );
  it('signs out all sessions without changing the password', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    form();
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign out all sessions' })
    );
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledWith('/api/auth/signout-all', undefined);
  });
  it('keeps errors and input visible without logging out after a wrong current password', async () => {
    vi.mocked(api.post).mockRejectedValue(new Error('wrong password'));
    form();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change password and sign out' })
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Check your current password'
    );
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByLabelText('New password')).toHaveValue(
      'synthetic new password'
    );
  });
  it('rejects passwords over 64 characters and mismatches before sending', () => {
    form();
    for (const value of ['x'.repeat(65), '😀'.repeat(65)]) {
      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password'), {
        target: { value },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Change password and sign out' })
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Use at most 64 characters.'
      );
    }
    fireEvent.change(screen.getByLabelText('New password'), {
      target: { value: 'x' },
    });
    fireEvent.change(screen.getByLabelText('Confirm new password'), {
      target: { value: 'y' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Change password and sign out' })
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Passwords do not match'
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});

afterEach(cleanup);
