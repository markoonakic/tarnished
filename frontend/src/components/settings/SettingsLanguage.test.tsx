import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import { DEFAULT_USER_PREFERENCES } from '@/lib/userPreferences';
import SettingsLanguage from './SettingsLanguage';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'owner' } }),
}));
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  mutate: vi.fn(),
  pending: false,
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: () => mocks.read(),
  useUpdateUserPreferences: () => ({
    mutate: mocks.mutate,
    isPending: mocks.pending,
  }),
}));
vi.mock('@/lib/api', () => ({
  getBrowserTimeZone: () => 'Europe/Belgrade',
  default: {},
}));
beforeEach(async () => {
  await i18n.changeLanguage('en');
  mocks.mutate.mockClear();
  mocks.pending = false;
  mocks.read.mockReturnValue({ data: DEFAULT_USER_PREFERENCES });
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
});

it('saves language through the existing preference mutation without starting AI', () => {
  render(
    <MemoryRouter>
      <SettingsLanguage />
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Srpski (latinica)' }));
  expect(mocks.mutate).toHaveBeenCalledExactlyOnceWith({ language: 'sr-Latn' });
  fireEvent.click(screen.getByRole('button', { name: 'Language & time' }));
  expect(screen.getByRole('tooltip')).toHaveTextContent(
    /Quotes stay in the source language/
  );
});
it('shows Serbian labels, the account selection and the 24-hour preview', async () => {
  await i18n.changeLanguage('sr-Latn');
  mocks.read.mockReturnValue({
    data: { ...DEFAULT_USER_PREFERENCES, language: 'sr-Latn' },
  });
  render(
    <MemoryRouter>
      <SettingsLanguage />
    </MemoryRouter>
  );
  expect(
    screen.getByRole('heading', { name: /Jezik i vreme/ })
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Srpski (latinica)' })
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText(/8\. 10\. 2026\., 14:30/)).toBeInTheDocument();
});
it('blocks repeated language writes during a save', () => {
  mocks.pending = true;
  render(
    <MemoryRouter>
      <SettingsLanguage />
    </MemoryRouter>
  );
  expect(
    screen.getByRole('button', { name: 'Srpski (latinica)' })
  ).toBeDisabled();
});
