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
    await screen.findByText(
      'Login failed. Check your email and password and try again.'
    )
  ).toBeVisible();
  expect(document.body.textContent).not.toContain('secret-canary');
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeEnabled();
});

it('accepts only nonempty string details, never stringifies objects', () => {
  for (const detail of [null, {}, [{ input: 'secret' }], '', '  ', 42]) {
    expect(safeErrorMessage(detail, 'Try again')).toBe('Try again');
  }
  expect(safeErrorMessage('Invalid credentials', 'Try again')).toBe(
    'Invalid credentials'
  );
});
