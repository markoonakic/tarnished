import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import i18n from '@/lib/i18n';
import LanguagePreference from './LanguagePreference';

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  data: undefined as undefined | { language: 'en' | 'sr-Latn' },
  enabled: false,
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: state.user }),
}));
vi.mock('@/hooks/useUserPreferences', () => ({
  useUserPreferences: ({ enabled }: { enabled: boolean }) => {
    state.enabled = enabled;
    return { data: state.data };
  },
}));
afterEach(async () => {
  cleanup();
  state.user = null;
  state.data = undefined;
  await i18n.changeLanguage('en');
});

it('uses the browser choice before sign-in and the owner preference after sign-in', async () => {
  await i18n.changeLanguage('sr-Latn');
  const view = render(<LanguagePreference />);
  expect(state.enabled).toBe(false);
  expect(i18n.language).toBe('sr-Latn');
  state.user = { id: 'first' };
  state.data = { language: 'en' };
  await act(async () => {
    view.rerender(<LanguagePreference />);
  });
  expect(state.enabled).toBe(true);
  expect(i18n.language).toBe('en');
  state.user = { id: 'second' };
  state.data = { language: 'sr-Latn' };
  await act(async () => {
    view.rerender(<LanguagePreference />);
  });
  expect(i18n.language).toBe('sr-Latn');
});

it('follows an optimistic language change and its rollback without starting work', async () => {
  state.user = { id: 'first' };
  state.data = { language: 'en' };
  const view = render(<LanguagePreference />);
  state.data = { language: 'sr-Latn' };
  await act(async () => {
    view.rerender(<LanguagePreference />);
  });
  expect(i18n.language).toBe('sr-Latn');
  state.data = { language: 'en' };
  await act(async () => {
    view.rerender(<LanguagePreference />);
  });
  expect(i18n.language).toBe('en');
});
