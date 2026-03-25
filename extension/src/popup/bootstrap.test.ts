import { describe, expect, it, vi } from 'vitest';

import { applyPopupTheme, fetchRuntimeText, updatePopupFavicon } from './bootstrap';

describe('popup bootstrap helpers', () => {
  it('recolors the popup favicon from the runtime asset', async () => {
    const favicon = { href: '' };
    const doc = {
      querySelector: vi.fn().mockReturnValue(favicon),
    } as unknown as Document;

    await updatePopupFavicon({
      accentColor: '#00ffaa',
      document: doc,
      getRuntimeUrl: vi.fn().mockReturnValue('chrome-extension://tree.svg'),
      fetchText: vi.fn().mockResolvedValue('<svg fill="#000"></svg>'),
      debug: vi.fn(),
      warn: vi.fn(),
    });

    expect(favicon.href).toContain('data:image/svg+xml,');
    expect(decodeURIComponent(favicon.href.split(',')[1] ?? '')).toContain('fill="#00ffaa"');
  });

  it('loads theme colors, updates favicon, and asks the background script to refresh', async () => {
    const colors = { accent: '#4cc9f0' };
    const applyThemeToDocument = vi.fn();
    const updateFavicon = vi.fn().mockResolvedValue(undefined);
    const refreshTheme = vi.fn();

    await applyPopupTheme({
      getThemeColors: vi.fn().mockResolvedValue(colors),
      applyThemeToDocument,
      updateFavicon,
      refreshTheme,
      debug: vi.fn(),
      warn: vi.fn(),
      rootStyle: {
        getPropertyValue: vi.fn().mockReturnValue('#4cc9f0'),
      },
    });

    expect(applyThemeToDocument).toHaveBeenCalledWith(colors);
    expect(updateFavicon).toHaveBeenCalledWith('#4cc9f0');
    expect(refreshTheme).toHaveBeenCalledTimes(1);
  });

  it('reads runtime text through fetch', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      text: vi.fn().mockResolvedValue('<svg />'),
    } as unknown as Response);

    try {
      await expect(fetchRuntimeText('chrome-extension://tree.svg')).resolves.toBe('<svg />');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
