import { describe, expect, it } from 'vitest';

import {
  extractDuplicateResourceId,
  mapApiErrorNameToCode,
} from './error-mapping';

describe('extension error mapping helpers', () => {
  it('extracts duplicate resource ids from backend messages', () => {
    expect(
      extractDuplicateResourceId('Job lead already exists. ID: abc123-def456')
    ).toBe('abc123-def456');
  });

  it('returns null when duplicate messages do not include an id', () => {
    expect(extractDuplicateResourceId('Already exists')).toBeNull();
  });

  it('maps known api client error names to extension error codes', () => {
    expect(mapApiErrorNameToCode('AuthenticationError')).toBe('ERR_AUTH_FAILED');
    expect(mapApiErrorNameToCode('TimeoutError')).toBe('ERR_TIMEOUT');
    expect(mapApiErrorNameToCode('DuplicateLeadError')).toBe('ERR_ALREADY_SAVED');
  });

  it('returns null for unmapped runtime error names', () => {
    expect(mapApiErrorNameToCode('UnexpectedError')).toBeNull();
  });
});
