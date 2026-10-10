import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import { ThemeProvider, useTheme } from './ThemeContext';
import SettingsImport from '@/components/settings/SettingsImport';

const { auth } = vi.hoisted(() => ({
  auth: { user: { id: 'owner' }, refreshUser: vi.fn() },
}));
vi.mock('./AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));
vi.mock('@/lib/themePreferences', async (original) => ({
  ...(await original<typeof import('@/lib/themePreferences')>()),
  updateThemeFavicon: vi.fn(),
}));
vi.mock('@/components/ImportModal', () => ({
  default: ({
    isOpen,
    onSuccess,
  }: {
    isOpen: boolean;
    onSuccess: () => void;
  }) => (isOpen ? <button onClick={onSuccess}>Complete import</button> : null),
}));

function Controls() {
  const theme = useTheme();
  return (
    <>
      <output>
        {theme.currentTheme}/{theme.currentAccent}
      </output>
      {['purple', 'yellow', 'red', 'blue'].map((accent) => (
        <button key={accent} onClick={() => theme.setAccentColor(accent)}>
          {accent}
        </button>
      ))}
      <button onClick={() => theme.setTheme('catppuccin')}>
        Catppuccin theme
      </button>
    </>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.user = { id: 'owner' };
  vi.mocked(api.get).mockResolvedValue({
    data: { theme: 'gruvbox-light', accent: 'blue' },
  });
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('hydrates saved appearance without writing local defaults to the server', async () => {
  localStorage.setItem('theme', 'dracula');
  localStorage.setItem('themeAccents', JSON.stringify({ dracula: 'red' }));
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  expect(await screen.findByText('gruvbox-light/blue')).toBeVisible();
  expect(document.documentElement).toHaveAttribute(
    'data-theme',
    'gruvbox-light'
  );
  expect(localStorage.getItem('theme')).toBe('gruvbox-light');
  expect(JSON.parse(localStorage.getItem('themeAccents')!)).toMatchObject({
    'gruvbox-light': 'blue',
  });
  expect(api.patch).not.toHaveBeenCalled();
});

it('refreshes restored appearance immediately after a completed import', async () => {
  const view = render(
    <MemoryRouter>
      <ThemeProvider>
        <Controls />
        <SettingsImport />
      </ThemeProvider>
    </MemoryRouter>
  );
  await screen.findByText('gruvbox-light/blue');
  vi.mocked(api.get).mockResolvedValue({
    data: { theme: 'catppuccin', accent: 'purple' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Import Data' }));
  fireEvent.click(screen.getByRole('button', { name: 'Complete import' }));
  expect(auth.refreshUser).toHaveBeenCalledOnce();
  auth.user = { id: 'owner' };
  view.rerender(
    <MemoryRouter>
      <ThemeProvider>
        <Controls />
        <SettingsImport />
      </ThemeProvider>
    </MemoryRouter>
  );
  expect(await screen.findByText('catppuccin/purple')).toBeVisible();
  expect(api.patch).not.toHaveBeenCalled();
});

it('keeps appearance writes in click order while an older save is delayed', async () => {
  let release!: (value: unknown) => void;
  vi.mocked(api.patch).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  await screen.findByText('gruvbox-light/blue');
  fireEvent.click(screen.getByRole('button', { name: 'purple' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole('button', { name: 'yellow' }));
  expect(screen.getByText('gruvbox-light/yellow')).toBeVisible();
  expect(api.patch).toHaveBeenCalledOnce();
  await act(async () => release({ data: {} }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.patch).mock.calls.map((call) => call[1])).toEqual([
    { theme: 'gruvbox-light', accent: 'purple' },
    { theme: 'gruvbox-light', accent: 'yellow' },
  ]);
});

it('continues the ordered save queue after a failure, including theme changes', async () => {
  vi.mocked(api.patch).mockRejectedValueOnce(new Error('Offline'));
  render(
    <ThemeProvider>
      <Controls />
    </ThemeProvider>
  );
  await screen.findByText('gruvbox-light/blue');
  fireEvent.click(screen.getByRole('button', { name: 'red' }));
  fireEvent.click(screen.getByRole('button', { name: 'Catppuccin theme' }));
  fireEvent.click(screen.getByRole('button', { name: 'blue' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api.patch).mock.calls.map((call) => call[1])).toEqual([
    { theme: 'gruvbox-light', accent: 'red' },
    { theme: 'catppuccin', accent: 'aqua' },
    { theme: 'catppuccin', accent: 'blue' },
  ]);
  expect(screen.getByText('catppuccin/blue')).toBeVisible();
});
