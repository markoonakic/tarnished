import { describe, expect, it } from 'vitest';

import { handleIframeInjectionRequest } from './iframe-injection';

describe('background iframe injection request', () => {
  it('never reports a false injection success', () => {
    // No cross-frame injection is performed, so claiming success would be a lie
    // that a caller could present to the user as a completed action.
    const response = handleIframeInjectionRequest(
      'https://jobs.example.com/apply'
    );

    expect(response.success).toBe(false);
    expect(response.reason).toBe('unsupported');
  });
});
