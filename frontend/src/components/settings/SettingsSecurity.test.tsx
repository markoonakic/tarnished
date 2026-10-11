import {
  act,
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

function unloadPrevented() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it('protects each password draft, canceled links and failed saves', async () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  form();
  expect(unloadPrevented()).toBe(true);
  const link = document.createElement('a');
  link.href = '/analytics';
  document.body.append(link);
  expect(fireEvent.click(link)).toBe(false);
  expect(confirm).toHaveBeenCalledOnce();
  link.remove();
  vi.mocked(api.post).mockRejectedValueOnce(new Error('Offline'));
  fireEvent.click(
    screen.getByRole('button', { name: 'Change password and sign out' })
  );
  await screen.findByRole('alert');
  expect(unloadPrevented()).toBe(true);
  expect(screen.getByLabelText('New password')).toHaveValue(
    'synthetic new password'
  );
  confirm.mockRestore();
});

it.each(['Current password', 'New password', 'Confirm new password'])(
  'protects a draft in only %s',
  (label) => {
    render(
      <MemoryRouter>
        <SettingsSecurity />
      </MemoryRouter>
    );
    expect(unloadPrevented()).toBe(false);
    fireEvent.change(screen.getByLabelText(label), {
      target: { value: 'draft' },
    });
    expect(unloadPrevented()).toBe(true);
  }
);

it('locks all password controls and repeated submits until saving ends, then signs out without an exit warning', async () => {
  let release!: () => void;
  vi.mocked(api.post).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = () => resolve({});
      })
  );
  form();
  const submit = screen.getByRole('button', {
    name: 'Change password and sign out',
  });
  fireEvent.click(submit);
  for (const label of [
    'Current password',
    'New password',
    'Confirm new password',
  ])
    expect(screen.getByLabelText(label)).toBeDisabled();
  expect(
    screen
      .getAllByRole('button', { name: 'Show password' })
      .every((button) => button.hasAttribute('disabled'))
  ).toBe(true);
  fireEvent.submit(submit.closest('form')!);
  expect(api.post).toHaveBeenCalledOnce();
  expect(unloadPrevented()).toBe(true);
  signOut.mockImplementationOnce(() => expect(unloadPrevented()).toBe(false));
  await act(async () => release());
  expect(signOut).toHaveBeenCalledOnce();
});

afterEach(cleanup);
