import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('authenticated api helpers', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('adds the bearer token to authenticated fetch requests', async () => {
    localStorage.setItem('access_token', 'token-1');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

    const { fetchWithAuth } = await import('./api');
    await fetchWithAuth('/api/example');

    const [url, options] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toContain('/api/example');
    const headers = options?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  it('refreshes tokens and retries once after a 401 response', async () => {
    localStorage.setItem('access_token', 'expired-token');
    localStorage.setItem('refresh_token', 'refresh-token');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input) => {
        const url = String(input);
        if (url.endsWith('/api/auth/refresh')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                access_token: 'fresh-token',
                refresh_token: 'fresh-refresh-token',
              }),
              { status: 200 }
            )
          );
        }

        const authHeader = fetchMock.mock.calls.at(-1)?.[1]?.headers as
          | Headers
          | Record<string, string>
          | undefined;
        const token =
          authHeader instanceof Headers
            ? authHeader.get('Authorization')
            : authHeader?.Authorization;

        if (token === 'Bearer expired-token') {
          return Promise.resolve(new Response(null, { status: 401 }));
        }

        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), { status: 200 })
        );
      });

    const { fetchWithAuth } = await import('./api');
    const response = await fetchWithAuth('/api/protected');

    expect(response.status).toBe(200);
    expect(localStorage.getItem('access_token')).toBe('fresh-token');
    expect(localStorage.getItem('refresh_token')).toBe('fresh-refresh-token');
  });
});
