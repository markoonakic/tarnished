import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsAPIKey from './SettingsAPIKey';

const { createAPIKey, deleteAPIKey, listAPIKeys, updateAPIKey } = vi.hoisted(
  () => ({
    listAPIKeys: vi.fn(),
    createAPIKey: vi.fn(),
    updateAPIKey: vi.fn(),
    deleteAPIKey: vi.fn(),
  })
);

vi.mock('../../lib/settings', () => ({
  listAPIKeys,
  createAPIKey,
  updateAPIKey,
  deleteAPIKey,
}));

vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('SettingsAPIKey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders existing named api keys from the multi-key endpoint', async () => {
    listAPIKeys.mockResolvedValueOnce([
      {
        id: 'key-1',
        label: 'MacBook CLI',
        preset: 'cli',
        scopes: ['applications:read', 'applications:write'],
        key_prefix: 'abcd1234',
        created_at: '2026-04-09T07:00:00Z',
        last_used_at: null,
        revoked_at: null,
      },
      {
        id: 'key-2',
        label: 'Firefox Extension',
        preset: 'extension',
        scopes: ['job_leads:read', 'job_leads:write'],
        key_prefix: 'efgh5678',
        created_at: '2026-04-09T08:00:00Z',
        last_used_at: '2026-04-09T08:30:00Z',
        revoked_at: null,
      },
    ]);

    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAPIKeys).toHaveBeenCalled());

    expect(screen.getByText('MacBook CLI')).toBeInTheDocument();
    expect(screen.getByText('Firefox Extension')).toBeInTheDocument();
    expect(screen.getByText(/Preset: cli/i)).toBeInTheDocument();
    expect(screen.getByText(/Preset: extension/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /create api key/i })
    ).toBeInTheDocument();
  });

  it('creates a custom-scoped key from advanced mode', async () => {
    listAPIKeys.mockResolvedValueOnce([]);
    createAPIKey.mockResolvedValueOnce({
      id: 'key-3',
      label: 'Custom CLI',
      preset: 'custom',
      scopes: ['round_types:read'],
      key_prefix: 'ijkl9012',
      created_at: '2026-04-09T09:00:00Z',
      last_used_at: null,
      revoked_at: null,
      api_key: 'raw-secret-key',
    });

    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAPIKeys).toHaveBeenCalled());

    fireEvent.change(screen.getByPlaceholderText(/macbook cli/i), {
      target: { value: 'Custom CLI' },
    });
    fireEvent.change(screen.getAllByRole('combobox')[0], {
      target: { value: 'custom' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: /advanced scopes/i })[0]
    );
    fireEvent.click(screen.getByLabelText(/round_types:read/i));
    fireEvent.click(
      screen.getAllByRole('button', { name: /^create api key$/i })[0]
    );

    await waitFor(() =>
      expect(createAPIKey).toHaveBeenCalledWith({
        label: 'Custom CLI',
        preset: 'custom',
        scopes: ['round_types:read'],
      })
    );
  });

  it('updates an existing key to custom scopes in edit mode', async () => {
    listAPIKeys.mockResolvedValueOnce([
      {
        id: 'key-1',
        label: 'MacBook CLI',
        preset: 'cli',
        scopes: ['applications:read', 'applications:write'],
        key_prefix: 'abcd1234',
        created_at: '2026-04-09T07:00:00Z',
        last_used_at: null,
        revoked_at: null,
      },
    ]);
    updateAPIKey.mockResolvedValueOnce({
      id: 'key-1',
      label: 'MacBook CLI',
      preset: 'custom',
      scopes: ['round_types:read'],
      key_prefix: 'abcd1234',
      created_at: '2026-04-09T07:00:00Z',
      last_used_at: null,
      revoked_at: null,
    });

    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );

    await waitFor(() => expect(listAPIKeys).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /rename/i }));
    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: 'custom' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: /advanced scopes/i })[1]
    );
    fireEvent.click(screen.getByLabelText(/round_types:read/i));
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateAPIKey).toHaveBeenCalledWith('key-1', {
        label: 'MacBook CLI',
        preset: 'custom',
        scopes: ['round_types:read'],
      })
    );
  });
});
