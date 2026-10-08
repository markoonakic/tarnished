import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import Login from './Login';
import api, { safeErrorMessage } from '../lib/api';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ refreshUser: vi.fn() }),
}));
const original = api.defaults.adapter;
afterEach(() => {
  cleanup();
  api.defaults.adapter = original;
});

it('renders a usable 422 error without validation objects, input or secrets', async () => {
  api.defaults.adapter = async (config) => {
    throw new AxiosError('Request failed', undefined, config, undefined, {
      config,
      headers: {},
      status: 422,
      statusText: 'Unprocessable Entity',
      data: {
        detail: [
          {
            loc: ['body', 'password'],
            msg: 'bad secret-canary',
            input: 'secret-canary',
            ctx: { password: 'secret-canary' },
          },
        ],
      },
    });
  };
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'synthetic@example.test' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'synthetic-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  expect(
    await screen.findByText('Check the entered values and try again.')
  ).toBeVisible();
  expect(document.body.textContent).not.toContain('secret-canary');
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
});

it('links to the first admin form when setup is needed', async () => {
  api.defaults.adapter = async (config) => ({
    config,
    headers: {},
    status: 200,
    statusText: 'OK',
    data: { needs_setup: true },
  });
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
  expect(
    await screen.findByRole('link', { name: 'Create the first admin account' })
  ).toHaveAttribute('href', '/register');
  expect(
    screen.queryByText(/Contact your administrator/)
  ).not.toBeInTheDocument();
});

it('links to public registration when setup is complete', async () => {
  api.defaults.adapter = async (config) => ({
    config,
    headers: {},
    status: 200,
    statusText: 'OK',
    data: { needs_setup: false },
  });
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
  expect(
    await screen.findByRole('link', { name: 'Create one' })
  ).toHaveAttribute('href', '/register');
  expect(screen.getByText(/No account/)).toBeInTheDocument();
});

it.each([
  ['account_pending', 'Your account is waiting for administrator approval.'],
  [
    'account_deactivated',
    'This account is deactivated. Contact the administrator.',
  ],
])('shows the safe sign-in message for %s', async (code, message) => {
  api.defaults.adapter = async (config) => {
    if (config.url?.endsWith('setup-status'))
      return {
        config,
        headers: {},
        status: 200,
        statusText: 'OK',
        data: { needs_setup: false },
      };
    throw new AxiosError('Request failed', undefined, config, undefined, {
      config,
      headers: {},
      status: 403,
      statusText: 'Forbidden',
      data: { code, detail: { code } },
    });
  };
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: 'new@example.com' },
  });
  fireEvent.change(screen.getByLabelText('Password'), {
    target: { value: 'local-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(message);
});

it('accepts only nonempty string details, never stringifies objects', () => {
  for (const detail of [null, {}, [{ input: 'secret' }], '', '  ', 42]) {
    expect(safeErrorMessage(detail, 'Try again')).toBe('Try again');
  }
  expect(safeErrorMessage('Invalid credentials', 'Try again')).toBe(
    'Invalid credentials'
  );
});
