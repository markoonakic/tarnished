import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n, { browserLanguage, LANGUAGE_STORAGE_KEY, locale, t } from './i18n';
import en from '../locales/en.json';
import sr from '../locales/sr-Latn.json';
import { statusLabel, roundTypeLabel } from './referenceLabels';
import { errorMessage } from './errorMessage';
import LanguageSwitch from '../components/LanguageSwitch';
import api from './api';
import { AxiosError } from 'axios';
import Layout from '../components/Layout';

const auth = vi.hoisted(() => ({
  user: { email: 'person@example.com', display_name: 'Ana', is_admin: false },
  signOut: vi.fn(),
}));
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }));
beforeEach(async () => {
  await i18n.changeLanguage('en');
  auth.user.is_admin = false;
});
afterEach(async () => {
  cleanup();
  await i18n.changeLanguage('en');
  localStorage.removeItem(LANGUAGE_STORAGE_KEY);
});

describe('bundled interface languages', () => {
  it('has a Serbian value for every typed English key', () => {
    expect(Object.keys(sr).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(sr)) {
      expect(value.trim()).not.toBe('');
      expect(value).not.toMatch(/[А-Яа-яЁё]/);
    }
  });
  it.each([
    [1, '1 prijava'],
    [2, '2 prijave'],
    [5, '5 prijava'],
    [11, '11 prijava'],
    [21, '21 prijava'],
    [22, '22 prijave'],
    [25, '25 prijava'],
    [111, '111 prijava'],
  ])('uses Serbian plural rules for %s', async (count, expected) => {
    await i18n.changeLanguage('sr-Latn');
    expect(t('applicationsCount', { count: Number(count) })).toBe(expected);
  });
  it('keeps user names even when they equal a built-in name', async () => {
    await i18n.changeLanguage('sr-Latn');
    expect(statusLabel({ name: 'Applied', builtin_key: null })).toBe('Applied');
    expect(
      statusLabel({ name: 'Renamed default', builtin_key: 'applied' })
    ).toBe('Poslata');
    expect(roundTypeLabel({ name: 'Technical' })).toBe('Technical');
    expect(
      roundTypeLabel({ name: 'Renamed default', builtin_key: 'technical' })
    ).toBe('Tehnički intervju');
  });
  it('translates codes, not untrusted server details or validation input', async () => {
    await i18n.changeLanguage('sr-Latn');
    expect(
      errorMessage({ code: 'invalid_credentials', detail: 'private input' })
    ).toBe('Netačna e-pošta ili lozinka.');
    expect(
      errorMessage({ code: 'new_unknown_error', detail: 'private input' })
    ).toBe('Zahtev nije uspeo');
    expect(errorMessage({ detail: [{ input: 'private input' }] }, 422)).toBe(
      'Proverite unete vrednosti i pokušajte ponovo.'
    );
  });
  it('uses Serbian dates and a 24-hour clock, with unchanged ISO source', async () => {
    await i18n.changeLanguage('sr-Latn');
    const instant = '2026-10-08T12:30:00Z';
    expect(
      new Date(instant).toLocaleString(locale(), {
        timeZone: 'Europe/Belgrade',
      })
    ).toContain('14:30');
    expect(
      new Date(instant).toLocaleDateString(locale(), { timeZone: 'UTC' })
    ).toBe('8. 10. 2026.');
  });
  it('changes the document language and remembers the signed-out choice', async () => {
    render(<LanguageSwitch />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SR' }));
    });
    expect(document.documentElement.lang).toBe('sr-Latn');
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('sr-Latn');
    expect(browserLanguage()).toBe('sr-Latn');
    expect(screen.getByRole('button', { name: 'SR' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
});

it('handles a non-JSON proxy error without exposing its body', async () => {
  await i18n.changeLanguage('sr-Latn');
  const adapter = api.defaults.adapter;
  api.defaults.adapter = async (config) => {
    throw new AxiosError('proxy', undefined, config, undefined, {
      data: 'private upstream response',
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config,
    });
  };
  try {
    await expect(api.get('/unavailable')).rejects.toMatchObject({
      response: { data: { detail: 'Servis nije mogao da završi zahtev.' } },
    });
  } finally {
    api.defaults.adapter = adapter;
  }
});

it('keeps settings and admin in the account disclosure and closes with Escape', () => {
  auth.user.is_admin = true;
  render(
    <MemoryRouter>
      <Layout>Content</Layout>
    </MemoryRouter>
  );
  const button = screen.getByRole('button', { name: 'Ana' });
  expect(
    screen.queryByRole('link', { name: 'Settings' })
  ).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
    'href',
    '/settings'
  );
  expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute(
    'href',
    '/admin'
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(button).toHaveFocus();
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});

it('does not show admin navigation to non-admin users', () => {
  render(
    <MemoryRouter>
      <Layout>Content</Layout>
    </MemoryRouter>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ana' }));
  expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument();
});
