import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Register from './Register';
import api from '../lib/api';
import { login } from '../lib/auth';

const { refreshUser } = vi.hoisted(() => ({ refreshUser: vi.fn() }));
vi.mock('../lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api')>()),
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('../lib/auth', () => ({ login: vi.fn() }));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: { needs_setup: true } });
});
afterEach(cleanup);

function renderSetup() {
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<h1>Dashboard</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fill(password = 'synthetic password 123', confirm = password) {
  fireEvent.change(await screen.findByLabelText('Email'), {
    target: { value: 'owner@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Confirm password'), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create admin account' }));
}

it('shows the first admin form only when setup is needed', async () => {
  renderSetup();
  expect(
    await screen.findByRole('heading', {
      name: 'Create the first admin account',
    })
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Email')).toBeRequired();
  expect(screen.getByLabelText('Password')).toHaveAttribute(
    'autocomplete',
    'new-password'
  );
  expect(screen.getByLabelText('Confirm password')).toBeRequired();
  expect(api.get).toHaveBeenCalledWith('/api/auth/setup-status');
  expect(screen.queryByText(/Use at (least|most)/)).not.toBeInTheDocument();
});

it('shows the managed accounts message without a form or command after setup', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { needs_setup: false } });
  renderSetup();
  expect(
    await screen.findByText(/Accounts are managed by your administrator/)
  ).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByText(/bootstrap-owner/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login'
  );
});

it.each(['x'.repeat(65), '😀'.repeat(65)])(
  'rejects an invalid password %s',
  async (password) => {
    renderSetup();
    await fill(password);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Use at most 64 characters.'
    );
    expect(api.post).not.toHaveBeenCalled();
  }
);

it('rejects mismatched passwords', async () => {
  renderSetup();
  await fill('synthetic password 123', 'another password 456');
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Passwords do not match.'
  );
  expect(api.post).not.toHaveBeenCalled();
});

it.each(['x', ' ', 'x'.repeat(64), '😀'.repeat(50)])(
  'creates the account and signs in with an accepted password',
  async (password) => {
    vi.mocked(api.post).mockResolvedValue({
      data: { id: 'owner', is_admin: true },
    });
    renderSetup();
    await fill(password);
    expect(
      await screen.findByRole('heading', { name: 'Dashboard' })
    ).toBeInTheDocument();
    const credentials = {
      email: 'owner@example.com',
      password,
    };
    expect(api.post).toHaveBeenCalledWith('/api/auth/setup', credentials);
    expect(login).toHaveBeenCalledWith(credentials);
    expect(refreshUser).toHaveBeenCalledOnce();
  }
);

it('offers sign in if account creation succeeds but login fails', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: {} });
  vi.mocked(login).mockRejectedValue(new Error('offline'));
  renderSetup();
  await fill();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Your account was created. Sign in to continue.'
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('handles a concurrent setup winner without offering another account', async () => {
  vi.mocked(api.post).mockRejectedValue({
    isAxiosError: true,
    response: {
      status: 409,
      data: { detail: 'Owner setup already completed' },
    },
  });
  renderSetup();
  await fill();
  expect(
    await screen.findByText(/Accounts are managed by your administrator/)
  ).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(login).not.toHaveBeenCalled();
});

it('reports setup check failures and lets the user retry', async () => {
  vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
  renderSetup();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Cannot check setup status. Try again.'
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry setup check' }));
  await waitFor(() =>
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
  );
});
