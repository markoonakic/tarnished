import { describe, expect, it, vi } from 'vitest';

import { createIframeRegistry, type IframeScanResult } from './iframe-registry';

function createScanResult(
  overrides: Partial<IframeScanResult> = {}
): IframeScanResult {
  return {
    hasApplicationForm: true,
    fillableFieldCount: 1,
    fields: [],
    ...overrides,
  };
}

describe('iframe registry', () => {
  it('records iframe scan results for later aggregation', () => {
    const registry = createIframeRegistry();

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: { postMessage: vi.fn() } as unknown as MessageEventSource,
      },
      createScanResult({ path: '/apply' })
    );

    expect(registry.getResults()).toEqual([
      createScanResult({ path: '/apply' }),
    ]);
  });

  it('sends autofill only to tracked iframes that reported form fields', () => {
    const eligibleTarget = { postMessage: vi.fn() };
    const emptyTarget = { postMessage: vi.fn() };
    const nullOriginTarget = { postMessage: vi.fn() };
    const registry = createIframeRegistry();

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: eligibleTarget as unknown as MessageEventSource,
      },
      createScanResult()
    );
    registry.recordScanResult(
      {
        origin: 'https://ads.example.com',
        source: emptyTarget as unknown as MessageEventSource,
      },
      createScanResult({ hasApplicationForm: false, fillableFieldCount: 0 })
    );
    registry.recordScanResult(
      {
        origin: 'null',
        source: nullOriginTarget as unknown as MessageEventSource,
      },
      createScanResult()
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
        },
      },
      'https://jobs.example.com'
    );
    expect(emptyTarget.postMessage).not.toHaveBeenCalled();
    expect(nullOriginTarget.postMessage).not.toHaveBeenCalled();
  });

  it('ignores events without a postMessage-capable source', () => {
    const registry = createIframeRegistry();

    registry.recordScanResult(
      {
        origin: 'https://jobs.example.com',
        source: null,
      },
      createScanResult()
    );

    expect(
      registry.sendAutofill('TARNISHED_IFRAME_AUTOFILL', { first_name: 'Ada' })
    ).toBe(0);
  });
});
