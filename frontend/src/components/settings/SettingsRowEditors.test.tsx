import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import * as settings from '@/lib/settings';
import SettingsAPIKey from './SettingsAPIKey';
import SettingsStatuses from './SettingsStatuses';
import SettingsRoundTypes from './SettingsRoundTypes';

vi.mock('@/lib/settings', () => ({
  listAPIKeys: vi.fn(),
  createAPIKey: vi.fn(),
  updateAPIKey: vi.fn(),
  deleteAPIKey: vi.fn(),
  listStatuses: vi.fn(),
  createStatus: vi.fn(),
  updateStatus: vi.fn(),
  deleteStatus: vi.fn(),
  listRoundTypes: vi.fn(),
  createRoundType: vi.fn(),
  updateRoundType: vi.fn(),
  deleteRoundType: vi.fn(),
}));
vi.mock('@/hooks/useThemeColors', () => ({ useThemeColors: () => ({}) }));
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(settings.listStatuses).mockResolvedValue(
    ['First', 'Second'].map((name) => ({
      id: name,
      name,
      color: '#ffffff',
      meaning: 'unknown',
      is_default: false,
    }))
  );
  vi.mocked(settings.listRoundTypes).mockResolvedValue(
    ['First', 'Second'].map((name) => ({ id: name, name, is_default: false }))
  );
  vi.mocked(settings.updateAPIKey).mockResolvedValue({
    id: 'First',
    label: 'Retained label',
    revision: 2,
    preset: 'full_access',
    scopes: [],
    key_prefix: 'fixture',
    created_at: '2026-10-01',
    last_used_at: null,
    revoked_at: null,
  });
  vi.mocked(settings.listAPIKeys).mockResolvedValue(
    ['First', 'Second'].map((label) => ({
      id: label,
      label,
      revision: 1,
      preset: 'read_only',
      scopes: [],
      key_prefix: 'fixture',
      created_at: '2026-10-01',
      last_used_at: null,
      revoked_at: null,
    }))
  );
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it.each(['en', 'sr-Latn'])(
  'keeps key label and permission drafts when another Rename is clicked in %s',
  async (language) => {
    await i18n.changeLanguage(language);
    render(
      <MemoryRouter>
        <SettingsAPIKey />
      </MemoryRouter>
    );
    const rename = await screen.findAllByRole('button', {
      name: i18n.t('Rename'),
    });
    fireEvent.click(rename[0]);
    fireEvent.change(screen.getByDisplayValue('First'), {
      target: { value: 'Retained label' },
    });
    const preset = screen.getAllByRole('combobox', {
      name: i18n.t('Preset'),
    })[1];
    fireEvent.click(preset);
    fireEvent.click(
      await screen.findByRole('option', { name: i18n.t('Full Access') })
    );
    expect(rename[1]).toBeDisabled();
    fireEvent.click(rename[1]);
    expect(screen.getByDisplayValue('Retained label')).toBeVisible();
    expect(preset).toHaveTextContent(i18n.t('Full Access'));
    expect(settings.updateAPIKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('Save') }));
    await waitFor(() =>
      expect(settings.updateAPIKey).toHaveBeenCalledWith('First', {
        label: 'Retained label',
        expected_revision: 1,
        preset: 'full_access',
      })
    );
  }
);

for (const [name, Component] of [
  ['status', SettingsStatuses],
  ['round type', SettingsRoundTypes],
] as const) {
  it.each(['en', 'sr-Latn'])(
    `keeps the first ${name} draft until Save or Cancel in %s`,
    async (language) => {
      await i18n.changeLanguage(language);
      render(
        <MemoryRouter>
          <Component />
        </MemoryRouter>
      );
      const edit = await screen.findAllByRole('button', {
        name: i18n.t('Edit'),
      });
      fireEvent.click(edit[0]);
      fireEvent.change(screen.getByDisplayValue('First'), {
        target: { value: 'Retained name' },
      });
      for (const button of edit) expect(button).toBeDisabled();
      fireEvent.click(edit[1]);
      expect(screen.getByDisplayValue('Retained name')).toBeVisible();
      expect(screen.queryByDisplayValue('Second')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: i18n.t('Cancel') }));
      expect(edit[1]).toBeEnabled();
      fireEvent.click(edit[1]);
      expect(screen.getByDisplayValue('Second')).toBeVisible();
    }
  );
}
