import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiClientError,
  AuthenticationError,
  DuplicateLeadError,
  fetchJson,
  TimeoutError,
} from './api-core';
import { NoSettingsError } from './errors';

const { getSettings } = vi.hoisted(() => ({ getSettings: vi.fn() }));
vi.mock('./storage', () => ({ getSettings }));
vi.mock('./logger', () => ({ warn: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function configure() {
  getSettings.mockResolvedValue({
    appUrl: 'https://fixture.invalid/',
    apiKey: 'test-key',
  });
}

describe('API transport', () => {
  it('merges Headers and blocks redirects for API-key requests', async () => {
    configure();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}'));
    await fetchJson('/api/profile', {
      method: 'GET',
      headers: new Headers({
        Accept: 'application/json',
        'X-API-Key': 'other-key',
      }),
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://fixture.invalid/api/profile',
      expect.objectContaining({
        headers: { accept: 'application/json', 'x-api-key': 'test-key' },
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('keeps the timeout active while the response body is read', async () => {
    configure();
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_url, init) =>
        ({
          ok: true,
          json: () =>
            new Promise((_resolve, reject) => {
              init?.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError'))
              );
            }),
        }) as Response
    );
    const request = fetchJson('/api/profile', { method: 'GET' });
    const outcome = expect(request).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not echo header values from transport errors', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new TypeError('Invalid header value: test-key')
    );
    await expect(
      fetchJson('/api/profile', { method: 'GET' })
    ).rejects.toMatchObject({
      name: 'NetworkError',
      message: 'Network error. Please check your connection.',
    });
  });

  it('reports malformed success JSON as a response error', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Not JSON</html>')
    );
    await expect(fetchJson('/api/profile', { method: 'GET' })).rejects.toEqual(
      new ApiClientError('Server returned an invalid JSON response.', 200)
    );
  });

  it('reports missing settings without making a request', async () => {
    getSettings.mockResolvedValue({ appUrl: '', apiKey: '' });
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(
      fetchJson('/api/profile', { method: 'GET' })
    ).rejects.toBeInstanceOf(NoSettingsError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    [],
    { detail: [] },
    { detail: { message: { invalid: true } } },
  ])('uses a readable fallback for malformed error body %j', async (body) => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(body), { status: 422 })
    );
    await expect(
      fetchJson('/api/profile', { method: 'GET' })
    ).rejects.toMatchObject({
      message: 'Request failed with status 422',
      status: 422,
    });
  });

  it('preserves unknown structured error messages and status', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'REVISION_CONFLICT',
            message: 'Reload the lead before retrying.',
          },
        }),
        { status: 409 }
      )
    );
    await expect(
      fetchJson(
        '/api/job-leads/id/extract',
        { method: 'POST' },
        { allowStructuredErrors: true }
      )
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'ApiClientError',
        status: 409,
        message: 'Reload the lead before retrying.',
      })
    );
  });

  it('preserves structured duplicate IDs', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: {
            code: 'DUPLICATE_RESOURCE',
            id: 'lead-1',
            message: 'Already saved',
          },
        }),
        { status: 409 }
      )
    );
    await expect(
      fetchJson('/api/job-leads', { method: 'POST' })
    ).rejects.toBeInstanceOf(DuplicateLeadError);
  });

  it('reports authentication messages from the server', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Key revoked' }), { status: 401 })
    );
    await expect(fetchJson('/api/profile', { method: 'GET' })).rejects.toEqual(
      new AuthenticationError('Key revoked')
    );
  });

  it('does not classify a save conflict without a duplicate code as a duplicate', async () => {
    configure();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'Changed' }), { status: 409 })
    );
    await expect(
      fetchJson(
        '/api/job-leads',
        { method: 'POST' },
        { allowStructuredErrors: true }
      )
    ).rejects.toEqual(new ApiClientError('Changed', 409));
  });
});
