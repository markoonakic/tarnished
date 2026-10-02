import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageGet = vi.fn();

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: storageGet,
      },
    },
  },
}));

describe('logger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    storageGet.mockResolvedValue({ tarnished_debug: false });
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs debug messages when the stored setting is enabled', async () => {
    storageGet.mockResolvedValue({ tarnished_debug: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { debug } = await import('./logger');
    debug('Popup', 'visible message');
    expect(logSpy).toHaveBeenCalledWith('[Popup]', 'visible message');
  });

  it('suppresses debug logs by default', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { debug } = await import('./logger');

    debug('Popup', 'hidden message');

    expect(logSpy).not.toHaveBeenCalled();
  });

  it('always emits warnings and errors', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { warn, error } = await import('./logger');

    warn('Popup', 'warning');
    error('Popup', 'failure');

    expect(warnSpy).toHaveBeenCalledWith('[Popup]', 'warning');
    expect(errorSpy).toHaveBeenCalledWith('[Popup]', 'failure');
  });
});
