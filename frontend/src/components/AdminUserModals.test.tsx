import { useState } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '../lib/api';
import type { AdminUser } from '../lib/admin';
import CreateUserModal from './CreateUserModal';
import EditUserModal from './EditUserModal';

const firstUser: AdminUser = {
  id: 'user-first',
  email: 'first@example.test',
  is_admin: true,
  is_active: false,
  created_at: '2026-01-01T00:00:00Z',
};
const secondUser: AdminUser = {
  id: 'user-second',
  email: 'second@example.test',
  is_admin: false,
  is_active: true,
  created_at: '2026-01-02T00:00:00Z',
};
const originalAdapter = api.defaults.adapter;
let requests: { method?: string; url?: string; body: unknown }[];
let failNextRequest: boolean;

beforeEach(() => {
  localStorage.clear();
  requests = [];
  failNextRequest = false;
  api.defaults.adapter = async (config) => {
    requests.push({
      method: config.method,
      url: config.url,
      body: config.data === undefined ? undefined : JSON.parse(config.data),
    });
    if (failNextRequest) {
      failNextRequest = false;
      throw new Error('Synthetic network failure');
    }
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
  };
});
afterEach(() => {
  cleanup();
  api.defaults.adapter = originalAdapter;
  localStorage.clear();
});

it('clears a failed edited create draft on close/reopen and creates only on explicit submit', async () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  function CreateDialog() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>New user</button>
        <CreateUserModal
          isOpen={open}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onSuccess={onSuccess}
        />
      </>
    );
  }
  render(<CreateDialog />);
  fireEvent.click(screen.getByRole('button', { name: 'New user' }));
  expect(requests).toEqual([]);
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: 'failed@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: 'Synthetic first 123!' },
  });
  failNextRequest = true;
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await screen.findByText(
    'Failed to create user. Email may already be in use.'
  );
  expect(requests).toEqual([
    {
      method: 'post',
      url: '/api/admin/users',
      body: { email: 'failed@example.test', password: 'Synthetic first 123!' },
    },
  ]);
  expect(onClose).not.toHaveBeenCalled();
  expect(onSuccess).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: 'unsaved@example.test' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'New user' }));
  expect(screen.getByLabelText(/^Email/)).toHaveValue('');
  expect(screen.getByLabelText(/^Password/)).toHaveValue('');
  expect(screen.queryByText(/Failed to create user/)).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
  fireEvent.change(screen.getByLabelText(/^Email/), {
    target: { value: 'created@example.test' },
  });
  fireEvent.change(screen.getByLabelText(/^Password/), {
    target: { value: 'Synthetic created 456!' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({
    method: 'post',
    url: '/api/admin/users',
    body: { email: 'created@example.test', password: 'Synthetic created 456!' },
  });
});

it('switches selected users without carrying the previous password, flags or error', async () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  const props = { onClose, onSuccess, currentUserId: 'operator' };
  const view = render(<EditUserModal {...props} user={firstUser} />);
  expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Active' })).not.toBeChecked();
  expect(requests).toEqual([]);
  fireEvent.change(screen.getByLabelText('New Password (optional)'), {
    target: { value: 'Synthetic previous 123!' },
  });
  failNextRequest = true;
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Failed to update user');
  expect(requests).toEqual([
    {
      method: 'patch',
      url: '/api/admin/users/user-first',
      body: {
        is_admin: true,
        is_active: false,
        password: 'Synthetic previous 123!',
      },
    },
  ]);
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onClose).not.toHaveBeenCalled();
  view.rerender(<EditUserModal {...props} user={secondUser} />);
  expect(screen.getByText('second@example.test')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'Admin' })).not.toBeChecked();
  expect(screen.getByRole('checkbox', { name: 'Active' })).toBeChecked();
  expect(screen.getByLabelText('New Password (optional)')).toHaveValue('');
  expect(screen.queryByText('Failed to update user')).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
  expect(onClose).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(2);
  expect(requests[1]).toEqual({
    method: 'patch',
    url: '/api/admin/users/user-second',
    body: { is_admin: false, is_active: true },
  });
});

it.each([
  { name: 'omits a blank password', password: '', expectedPassword: {} },
  {
    name: 'sends an explicit valid password',
    password: 'Synthetic reset 789!',
    expectedPassword: { password: 'Synthetic reset 789!' },
  },
])(
  '$name when saving changed flags for the selected user',
  async ({ password, expectedPassword }) => {
    const onClose = vi.fn();
    const onSuccess = vi.fn();
    render(
      <EditUserModal
        user={firstUser}
        currentUserId="operator"
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Admin' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
    fireEvent.change(screen.getByLabelText('New Password (optional)'), {
      target: { value: password },
    });
    expect(requests).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
    expect(requests).toEqual([
      {
        method: 'patch',
        url: '/api/admin/users/user-first',
        body: { is_admin: false, is_active: true, ...expectedPassword },
      },
    ]);
  }
);

it.each(['create', 'edit'])(
  'keeps the %s modal and its fields locked until the write ends',
  async (mode) => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const adapter = api.defaults.adapter as import('axios').AxiosAdapter;
    api.defaults.adapter = async (config) => {
      await pending;
      return adapter(config);
    };
    const close = vi.fn();
    if (mode === 'create') {
      render(<CreateUserModal isOpen onClose={close} onSuccess={vi.fn()} />);
      fireEvent.change(screen.getByLabelText(/^Email/), {
        target: { value: 'new@example.test' },
      });
      fireEvent.change(screen.getByLabelText(/^Password/), {
        target: { value: 'Synthetic password 123!' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(screen.getByLabelText(/^Email/)).toBeDisabled();
    } else {
      render(
        <EditUserModal
          user={firstUser}
          currentUserId="operator"
          onClose={close}
          onSuccess={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(screen.getByRole('checkbox', { name: 'Admin' })).toBeDisabled();
    }
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close modal' })).toBeDisabled();
    fireEvent(
      screen.getByRole('dialog'),
      new Event('cancel', { cancelable: true })
    );
    expect(close).not.toHaveBeenCalled();
    release();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  }
);

it('keeps self-management controls disabled but allows closing without a write', () => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <EditUserModal
      user={firstUser}
      currentUserId="user-first"
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
  const admin = screen.getByRole('checkbox', { name: 'Admin' });
  const active = screen.getByRole('checkbox', { name: 'Active' });
  expect(admin).toBeChecked();
  expect(active).not.toBeChecked();
  for (const control of [
    admin,
    active,
    screen.getByLabelText('New Password (optional)'),
    screen.getByRole('button', { name: 'Save' }),
    screen.getByRole('button', { name: 'Delete' }),
  ])
    expect(control).toBeDisabled();
  expect(
    screen.getByText(/Change your own password in Settings/)
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(requests).toEqual([]);
  expect(onSuccess).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
