import { render, screen, waitFor } from '@testing-library/react';
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
        key_prefix: 'abcd1234',
        created_at: '2026-04-09T07:00:00Z',
        last_used_at: null,
        revoked_at: null,
      },
      {
        id: 'key-2',
        label: 'Firefox Extension',
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
    expect(
      screen.getByRole('button', { name: /create api key/i })
    ).toBeInTheDocument();
  });
});
