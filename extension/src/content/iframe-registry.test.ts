import { describe, expect, it, vi } from 'vitest';

import { createIframeRegistry, type IframeScanResult } from './iframe-registry';

function createScanResult(
  overrides: Partial<IframeScanResult> = {}
): IframeScanResult {
  return {
    hasApplicationForm: true,
    fillableFieldCount: 1,
    ...overrides,
  };
}

describe('iframe registry', () => {
  const TOKEN = 'page-token-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const trustAll = () => true;
  const resolvePassthrough = (source: MessageEventSource | null) =>
    source as unknown as {
      postMessage: (message: unknown, targetOrigin: string) => void;
    } | null;
  const options = {
    isTrustedFrame: trustAll,
    resolveFrameWindow: resolvePassthrough,
    scanToken: TOKEN,
  };

  it('records iframe scan results for later aggregation', () => {
    const registry = createIframeRegistry(options);

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: { postMessage: vi.fn() } as unknown as MessageEventSource,
      },
      createScanResult({ token: TOKEN })
    );

    expect(registry.getResults()).toEqual([createScanResult({ token: TOKEN })]);
  });

  it('tracks multiple frames from the same origin independently', () => {
    const registry = createIframeRegistry(options);
    const first = { postMessage: vi.fn() };
    const second = { postMessage: vi.fn() };
    for (const source of [first, second]) {
      registry.recordScanResult(
        { origin: 'https://jobs.example.com', source: source as never },
        createScanResult({ token: TOKEN })
      );
    }
    expect(registry.getResults()).toHaveLength(2);
    expect(registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {})).toBe(2);
    expect(first.postMessage).toHaveBeenCalledOnce();
    expect(second.postMessage).toHaveBeenCalledOnce();
  });

  it('removes detached frames from the reported field count', () => {
    const source = { postMessage: vi.fn() };
    let attached = true;
    const registry = createIframeRegistry({
      ...options,
      resolveFrameWindow: () => (attached ? source : null),
    });
    registry.recordScanResult(
      { origin: 'https://jobs.example.com', source: source as never },
      createScanResult({ token: TOKEN })
    );
    expect(registry.getResults()).toHaveLength(1);
    attached = false;
    expect(registry.getResults()).toEqual([]);
    expect(registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {})).toBe(0);
  });

  it('ignores scan results from frames this page does not embed', () => {
    // A frame that merely claims an origin or a form must not be tracked, or it
    // could later receive the user's profile data.
    const registry = createIframeRegistry({
      isTrustedFrame: () => false,
      resolveFrameWindow: resolvePassthrough,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      {
        origin: 'https://ads.example.com',
        source: { postMessage: vi.fn() } as unknown as MessageEventSource,
      },
      createScanResult({ token: TOKEN })
    );

    expect(registry.getResults()).toEqual([]);
    expect(registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {})).toBe(0);
  });

  it('ignores an EMBEDDED frame that forges a scan result with no token', () => {
    // The attack the token closes: an advertisement or tracker embedded by the
    // page posts the scan-result message type itself, never loading our scanner.
    // Frame embedding alone must never authorize receiving the profile.
    const adWindow = { postMessage: vi.fn() };
    const registry = createIframeRegistry({
      isTrustedFrame: () => true,
      resolveFrameWindow: () => adWindow,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      { origin: 'https://ads.attacker.example', source: adWindow as never },
      createScanResult({ token: undefined })
    );

    expect(registry.getResults()).toEqual([]);
    expect(
      registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {
        first_name: 'Ada',
        email: 'ada@example.com',
      })
    ).toBe(0);
    expect(adWindow.postMessage).not.toHaveBeenCalled();
  });

  it('ignores an embedded frame that forges a scan result with a wrong token', () => {
    const adWindow = { postMessage: vi.fn() };
    const registry = createIframeRegistry({
      isTrustedFrame: () => true,
      resolveFrameWindow: () => adWindow,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      { origin: 'https://ads.attacker.example', source: adWindow as never },
      createScanResult({ token: 'guessed-wrong-token' })
    );

    expect(registry.getResults()).toEqual([]);
    expect(
      registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', { email: 'ada@e.c' })
    ).toBe(0);
    expect(adWindow.postMessage).not.toHaveBeenCalled();
  });

  it('sends autofill only to a frame that returned the authentic token', () => {
    const honest = { postMessage: vi.fn() };
    const forger = { postMessage: vi.fn() };
    const registry = createIframeRegistry({
      isTrustedFrame: () => true,
      resolveFrameWindow: (source) =>
        source as unknown as {
          postMessage: (message: unknown, targetOrigin: string) => void;
        } | null,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      { origin: 'https://jobs.example.com', source: honest as never },
      createScanResult({ token: TOKEN })
    );
    registry.recordScanResult(
      { origin: 'https://ads.example.com', source: forger as never },
      createScanResult({ token: undefined })
    );

    expect(
      registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', { email: 'a@b.c' })
    ).toBe(1);
    expect(honest.postMessage).toHaveBeenCalledTimes(1);
    expect(forger.postMessage).not.toHaveBeenCalled();
  });

  it.each([
    { state: 'changed', expectedAttempts: 1 },
    { state: 'missing', expectedAttempts: 0 },
  ])(
    'uses the current resolved frame when it is $state at dispatch',
    ({ state, expectedAttempts }) => {
      // Change the resolver boundary after admission. This does not model ordinary
      // navigation replacing a WindowProxy, whose identity normally remains stable.
      const earlierTarget = { postMessage: vi.fn() };
      const currentTarget = { postMessage: vi.fn() };
      const source = { postMessage: vi.fn() } as unknown as MessageEventSource;
      let resolvedTarget: typeof earlierTarget | null = earlierTarget;
      const registry = createIframeRegistry({
        isTrustedFrame: trustAll,
        resolveFrameWindow: (candidate) =>
          candidate === source ? resolvedTarget : null,
        scanToken: TOKEN,
      });
      const result = createScanResult({ token: TOKEN });

      registry.recordScanResult(
        { origin: 'https://jobs.example.com', source },
        result
      );
      expect(registry.getResults()).toEqual([result]);

      resolvedTarget = state === 'changed' ? currentTarget : null;
      expect(
        registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', { email: 'a@b.c' })
      ).toBe(expectedAttempts);
      expect(earlierTarget.postMessage).not.toHaveBeenCalled();
      expect(source.postMessage).not.toHaveBeenCalled();
      if (state === 'changed') {
        expect(currentTarget.postMessage).toHaveBeenCalledExactlyOnceWith(
          {
            type: 'TARNISHED_IFRAME_AUTOFILL',
            payload: { profile: { email: 'a@b.c' }, token: TOKEN },
          },
          'https://jobs.example.com'
        );
      } else {
        expect(currentTarget.postMessage).not.toHaveBeenCalled();
      }
    }
  );

  it('never sends profile data to a non-http(s) origin', () => {
    const target = { postMessage: vi.fn() };
    const registry = createIframeRegistry({
      isTrustedFrame: trustAll,
      resolveFrameWindow: () => target,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      {
        origin: 'chrome-extension://abcdefghijklmnop',
        source: target as unknown as MessageEventSource,
      },
      createScanResult({ token: TOKEN })
    );

    expect(registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {})).toBe(0);
    expect(target.postMessage).not.toHaveBeenCalled();
  });

  it('sends autofill only to tracked iframes that reported form fields', () => {
    const eligibleTarget = { postMessage: vi.fn() };
    const emptyTarget = { postMessage: vi.fn() };
    const nullOriginTarget = { postMessage: vi.fn() };
    const registry = createIframeRegistry({
      isTrustedFrame: trustAll,
      resolveFrameWindow: (source) =>
        source as unknown as {
          postMessage: (message: unknown, targetOrigin: string) => void;
        } | null,
      scanToken: TOKEN,
    });

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: eligibleTarget as unknown as MessageEventSource,
      },
      createScanResult({ token: TOKEN })
    );
    registry.recordScanResult(
      {
        origin: 'https://ads.example.com',
        source: emptyTarget as unknown as MessageEventSource,
      },
      createScanResult({
        hasApplicationForm: false,
        fillableFieldCount: 0,
        token: TOKEN,
      })
    );
    registry.recordScanResult(
      {
        origin: 'null',
        source: nullOriginTarget as unknown as MessageEventSource,
      },
      createScanResult({ token: TOKEN })
    );

    const sentCount = registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', {
      email: 'alice@example.com',
    });

    expect(sentCount).toBe(1);
    expect(eligibleTarget.postMessage).toHaveBeenCalledWith(
      {
        type: 'TARNISHED_IFRAME_AUTOFILL',
        payload: {
          profile: {
            email: 'alice@example.com',
          },
          token: TOKEN,
        },
      },
      'https://jobs.example.com'
    );
    expect(emptyTarget.postMessage).not.toHaveBeenCalled();
    expect(nullOriginTarget.postMessage).not.toHaveBeenCalled();
  });

  it('ignores events without a postMessage-capable source', () => {
    const registry = createIframeRegistry(options);

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: null,
      },
      createScanResult({ token: TOKEN })
    );

    expect(
      registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', { first_name: 'Ada' })
    ).toBe(0);
  });
});
