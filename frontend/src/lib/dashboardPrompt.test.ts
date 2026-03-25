import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import {
  DASHBOARD_IMPORT_PROMPT_KEY,
  hasSeenImportPrompt,
  markImportPromptSeen,
} from './dashboardPrompt';

describe('dashboard prompt helpers', () => {
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
  });

  it('tracks import prompt dismissal in localStorage', () => {
    expect(hasSeenImportPrompt()).toBe(false);

    markImportPromptSeen();

    expect(localStorage.getItem(DASHBOARD_IMPORT_PROMPT_KEY)).toBe('true');
    expect(hasSeenImportPrompt()).toBe(true);
  });
});
