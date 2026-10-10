import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

async function selectDropdownOption(combobox: HTMLElement, optionName: RegExp) {
  fireEvent.click(combobox);
  fireEvent.click(await screen.findByRole('option', { name: optionName }));
}

describe('SettingsAPIKey', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('keeps stale key edit drafts and sends their original revision', async () => {
    listAPIKeys.mockResolvedValue([
      {
        id: 'key',
        label: 'Original',
        revision: 7,
        preset: 'full_access',
        scopes: [],
        key_prefix: 'fixture',
        created_at: '2026-10-01T00:00:00Z',
        last_used_at: null,
      },
    ]);
    updateAPIKey.mockRejectedValue(new Error('Conflict'));
    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.change(
      screen.getByLabelText('Label', { selector: 'input[id^=edit]' }),
      { target: { value: 'Keep label' } }
    );
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    await waitFor(() =>
      expect(updateAPIKey).toHaveBeenCalledWith('key', {
        label: 'Keep label',
        preset: 'full_access',
        expected_revision: 7,
      })
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Save$/ })).toBeEnabled()
    );
    expect(
      screen.getByLabelText('Label', { selector: 'input[id^=edit]' })
    ).toHaveValue('Keep label');
  });

  it('renders existing named api keys from the multi-key endpoint', async () => {
    listAPIKeys.mockResolvedValue([
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
    listAPIKeys.mockResolvedValue([]);
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
      revision: 0,
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
    await selectDropdownOption(screen.getAllByRole('combobox')[0], /custom/i);
    fireEvent.click(screen.getByRole('button', { name: /advanced scopes/i }));
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
    expect(
      screen.queryByText(
        'Copy this now. You will not be able to view it again.'
      )
    ).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole('button', { name: 'New API Key' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent(
      'Copy this now. You will not be able to view it again.'
    );
  });

  it('updates an existing key to custom scopes in edit mode', async () => {
    listAPIKeys.mockResolvedValue([
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

    const saveButton = await screen.findByRole('button', { name: /^save$/i });
    const editPanel = saveButton.closest('.space-y-4') as HTMLElement | null;

    expect(editPanel).toBeTruthy();

    const editQueries = within(editPanel!);
    const editPresetDropdown = editQueries.getByRole('combobox', {
      name: /preset/i,
    }) as HTMLElement;

    await selectDropdownOption(editPresetDropdown, /custom/i);
    fireEvent.click(
      editQueries.getByRole('button', { name: /advanced scopes/i })
    );
    fireEvent.click(editQueries.getByLabelText(/round_types:read/i));
    fireEvent.click(editQueries.getByRole('button', { name: /^save$/i }));

    await waitFor(() =>
      expect(updateAPIKey).toHaveBeenCalledWith('key-1', {
        label: 'MacBook CLI',
        preset: 'custom',
        scopes: ['round_types:read'],
        expected_revision: 0,
      })
    );
  });
});
