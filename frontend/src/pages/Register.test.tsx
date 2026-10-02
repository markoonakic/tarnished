import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import Register from './Register';
import api from '../lib/api';

vi.mock('../lib/api', () => ({ default: { get: vi.fn() } }));

it('shows operator-only setup, refreshes status and links to sign in without a signup form', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { needs_setup: false } });
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(
    screen.getByText(/python -m app.manage bootstrap-owner/)
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
    'href',
    '/login'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh setup status' }));
  expect(
    await screen.findByText('Setup is complete. You can sign in.')
  ).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/api/auth/setup-status');
});

it('reports setup status failures rather than presenting a public signup', async () => {
  vi.mocked(api.get).mockRejectedValue(new Error('offline'));
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Refresh setup status' }));
  expect(
    await screen.findByText('Cannot check setup status. Try again.')
  ).toBeInTheDocument();
});

afterEach(cleanup);
