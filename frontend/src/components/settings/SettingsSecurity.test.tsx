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
vi.mock('../../lib/api', () => ({ default: { post: vi.fn() } }));

function form() {
  render(
    <MemoryRouter>
      <SettingsSecurity />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Current password'), {
    target: { value: 'legacy' },
  });
  fireEvent.change(screen.getByLabelText('New password'), {
    target: { value: 'synthetic new password' },
  });
  fireEvent.change(screen.getByLabelText('Confirm new password'), {
    target: { value: 'synthetic new password' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SettingsSecurity', () => {
  it('changes password then clears the browser session', async () => {
    vi.mocked(api.post).mockResolvedValue({});
    form();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change password and sign out' })
    );
    await waitFor(() => expect(signOut).toHaveBeenCalledOnce());
    expect(api.post).toHaveBeenCalledWith('/api/auth/change-password', {
      current_password: 'legacy',
      new_password: 'synthetic new password',
    });
  });
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
  it('rejects UTF-8 overlong passwords and mismatches before sending', async () => {
    form();
    for (const value of ['short', 'é'.repeat(37), '😀'.repeat(19)]) {
      fireEvent.change(screen.getByLabelText('New password'), {
        target: { value },
      });
      fireEvent.change(screen.getByLabelText('Confirm new password'), {
        target: { value },
      });
      fireEvent.click(
        screen.getByRole('button', { name: 'Change password and sign out' })
      );
      expect(screen.getByRole('alert')).toHaveTextContent('72 UTF-8 bytes');
    }
    expect(api.post).not.toHaveBeenCalled();
  });
});

afterEach(cleanup);
