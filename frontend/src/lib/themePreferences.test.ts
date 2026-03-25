import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_THEME_ID,
  STORAGE_KEY_ACCENTS,
  getAccentOverrides,
  getStoredTheme,
  persistAccentOverrides,
  persistThemeSelection,
} from './themePreferences';

describe('theme preference helpers', () => {
  function createStorageMock(): Storage {
    const store = new Map<string, string>();
    return {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key: string) {
        return store.get(key) ?? null;
      },
      key(index: number) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key: string) {
        store.delete(key);
      },
      setItem(key: string, value: string) {
        store.set(key, value);
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns defaults when storage is empty or invalid', () => {
    expect(getStoredTheme()).toBe(DEFAULT_THEME_ID);

    localStorage.setItem(STORAGE_KEY_ACCENTS, '{bad json');
    expect(getAccentOverrides()).toEqual({});
  });

  it('persists theme and accent overrides', () => {
    persistThemeSelection('dracula');
    persistAccentOverrides({ dracula: 'green' });

    expect(getStoredTheme()).toBe('dracula');
    expect(getAccentOverrides()).toEqual({ dracula: 'green' });
  });
});
