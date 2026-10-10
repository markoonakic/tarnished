import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { DEFAULT_USER_PREFERENCES } from '@/lib/userPreferences';
import FeatureToggles from './FeatureToggles';
import SettingsLanguage from './SettingsLanguage';

const { getPreferences, updatePreferences } = vi.hoisted(() => ({
  getPreferences: vi.fn(),
  updatePreferences: vi.fn(),
}));
vi.mock('@/lib/userPreferences', async (original) => ({
  ...(await original<object>()),
  getPreferences,
  updatePreferences,
}));
vi.mock('@/hooks/useToast', () => ({ useToast: () => ({ error: vi.fn() }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test' } }),
}));
let client: QueryClient;
beforeEach(async () => {
  await i18n.changeLanguage('en');
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getPreferences.mockResolvedValue(DEFAULT_USER_PREFERENCES);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
function leaving() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

it.each(['feature', 'language', 'time zone'])(
  'protects a pending %s preference and releases the guard after save',
  async (kind) => {
    let release!: () => void;
    updatePreferences.mockImplementation(async (updates) => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ...DEFAULT_USER_PREFERENCES, ...updates };
    });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          {kind === 'feature' ? <FeatureToggles /> : <SettingsLanguage />}
        </MemoryRouter>
      </QueryClientProvider>
    );
    if (kind === 'feature')
      fireEvent.click(
        await screen.findByRole('switch', { name: 'Show Activity Heatmap' })
      );
    else if (kind === 'language')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Srpski (latinica)' })
      );
    else {
      const field = await screen.findByRole('combobox', { name: 'Time Zone' });
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'Asia/Tokyo' } });
      fireEvent.click(screen.getByRole('option', { name: 'Asia/Tokyo' }));
      await waitFor(() => expect(field).toBeDisabled());
      expect(field).toHaveValue('Asia/Tokyo');
    }
    await waitFor(() => expect(release).toBeTypeOf('function'));
    expect(leaving()).toBe(true);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const link = document.createElement('a');
    link.href = '/applications';
    document.body.appendChild(link);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    link.remove();
    release();
    await waitFor(() => expect(leaving()).toBe(false));
    expect(updatePreferences).toHaveBeenCalledOnce();
  }
);
