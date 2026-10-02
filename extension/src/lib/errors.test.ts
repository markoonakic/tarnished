import { describe, expect, it, vi } from 'vitest';
import { ApiClientError, DuplicateLeadError, TimeoutError } from './api-core';
import {
  AlreadySavedError,
  mapApiError,
  getErrorMessage,
  parseBackendError,
} from './errors';

vi.mock('./storage', () => ({}));
vi.mock('./logger', () => ({ warn: vi.fn() }));

describe('error messages', () => {
  it('maps errors by their stable name, not their bundled constructor name', () => {
    class BundledError extends TimeoutError {}
    const error = new BundledError();
    expect(mapApiError(error).code).toBe('ERR_TIMEOUT');
  });

  it('retains a duplicate identity that is not in the message', () => {
    expect(
      mapApiError(new DuplicateLeadError('Already saved', 'lead-1'))
    ).toMatchObject({
      code: 'ERR_ALREADY_SAVED',
      existingId: 'lead-1',
      recoverable: false,
    });
    expect(
      mapApiError(new DuplicateLeadError('Already saved', 'lead-1'))
    ).toBeInstanceOf(AlreadySavedError);
  });

  it('keeps scope and validation messages visible', () => {
    expect(
      mapApiError(new ApiClientError('Missing profile:read scope', 403)).message
    ).toBe('Missing profile:read scope');
  });

  it('does not label a network failure as a timeout', () => {
    const error = parseBackendError({
      code: 'ERR_NETWORK',
      message: 'Offline',
    });
    expect(error?.code).toBe('ERR_NETWORK');
  });

  it('leaves unknown codes for the HTTP status handler', () => {
    expect(
      parseBackendError({ code: 'UNKNOWN', message: 'Useful error' })
    ).toBeNull();
  });

  it('shows AI recovery actions with the error message', () => {
    const error = parseBackendError({
      code: 'AI_RATE_LIMITED',
      message: 'Busy',
      action: 'Wait 60 seconds',
    });
    expect(error).toMatchObject({
      code: 'AI_RATE_LIMITED',
      action: 'Wait 60 seconds',
      recoverable: true,
    });
    expect(getErrorMessage(error)).toContain('Wait 60 seconds');
  });
});
