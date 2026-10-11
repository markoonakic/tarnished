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

  it('shows all backend scopes and allows removal of every saved permission', async () => {
    const scopes = [
      'applications:read',
      'applications:write',
      'job_leads:read',
      'job_leads:write',
      'profile:read',
      'profile:write',
      'rounds:read',
      'rounds:write',
      'statuses:read',
      'statuses:write',
      'round_types:read',
      'round_types:write',
      'dashboard:read',
      'analytics:read',
      'analytics:generate',
      'streak:read',
      'streak:write',
      'preferences:read',
      'preferences:write',
      'user_settings:read',
      'user_settings:write',
      'files:read',
      'files:write',
      'export:read',
      'import:write',
      'admin:read',
      'admin:write',
    ];
    const key = {
      id: 'key',
      label: 'All scopes',
      revision: 1,
      preset: 'custom',
      scopes,
      key_prefix: 'fixture',
      created_at: '2026-10-01',
      last_used_at: null,
    };
    listAPIKeys.mockResolvedValue([key]);
    updateAPIKey.mockResolvedValue({ ...key, scopes: [] });
    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Advanced Scopes' })[1]
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(scopes.length);
    for (const scope of scopes) {
      expect(screen.getByLabelText(scope)).toBeChecked();
      fireEvent.click(screen.getByLabelText(scope));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(updateAPIKey).toHaveBeenCalledWith('key', {
        label: 'All scopes',
        expected_revision: 1,
        preset: 'custom',
        scopes: [],
      })
    );
  });
  it('previews the same Import / Export permissions that creation grants and locks pending create input', async () => {
    listAPIKeys.mockResolvedValue([]);
    createAPIKey.mockImplementation(() => new Promise(() => {}));
    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );
    const label = await screen.findByLabelText('Label');
    fireEvent.change(label, { target: { value: 'One request' } });
    const preset = screen.getByRole('combobox', { name: 'Preset' });
    await selectDropdownOption(preset, /Import.*Export/);
    fireEvent.click(screen.getByRole('button', { name: 'Advanced Scopes' }));
    for (const scope of [
      'applications:read',
      'job_leads:read',
      'export:read',
      'import:write',
      'files:read',
      'profile:read',
    ])
      expect(screen.getByLabelText(scope)).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Create API Key' }));
    expect(label).toBeDisabled();
    expect(preset).toBeDisabled();
    expect(screen.getByLabelText('files:read')).toBeDisabled();
  });
  it('bounds saved labels and keeps their actions outside the shrinking text column', async () => {
    const label = 'W'.repeat(180);
    listAPIKeys.mockResolvedValue([
      {
        id: 'long',
        label,
        preset: 'full_access',
        scopes: [],
        key_prefix: 'fixture',
        created_at: '2026-10-01',
        last_used_at: null,
      },
    ]);
    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );
    const value = await screen.findByText(label);
    expect(value.parentElement).toHaveClass(
      'min-w-0',
      'flex-1',
      '[overflow-wrap:anywhere]'
    );
    expect(
      screen.getByRole('button', { name: 'Rename' }).parentElement
    ).toHaveClass('shrink-0');
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

it('guards API-key label and preset drafts after a failed save', async () => {
  listAPIKeys.mockResolvedValue([
    {
      id: 'key',
      label: 'Original',
      revision: 1,
      preset: 'full_access',
      scopes: [],
      key_prefix: 'fixture',
      created_at: '2026-10-01T00:00:00Z',
    },
  ]);
  updateAPIKey.mockRejectedValueOnce(new Error('Offline'));
  render(
    <MemoryRouter>
      <SettingsAPIKey />
    </MemoryRouter>
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Rename' }));
  const label = screen.getByLabelText('Label', { selector: 'input[id^=edit]' });
  fireEvent.change(label, { target: { value: 'Keep key label' } });
  for (const failed of [false, true]) {
    if (failed) {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
      );
    }
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    expect(label).toHaveValue('Keep key label');
  }
});
