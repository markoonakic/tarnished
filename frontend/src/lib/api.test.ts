import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function responseError(config: InternalAxiosRequestConfig, status: number) {
  return new AxiosError(
    'Request rejected',
    'ERR_BAD_REQUEST',
    config,
    undefined,
    {
      status,
      statusText: 'Request rejected',
      headers: {},
      config,
      data: {},
    }
  );
}

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

  it('bounds data-read timeouts without changing downloads or writes', async () => {
    const { default: api } = await import('./api');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => ({
      status: 200,
      statusText: 'OK',
      config,
      headers: {},
      data: null,
    }));
    await api.get('/api/data', { adapter });
    await api.get('/api/download', { adapter, responseType: 'blob' });
    await api.post('/api/work', {}, { adapter });
    expect(adapter.mock.calls.map(([config]) => config.timeout)).toEqual([
      10_000, 0, 0,
    ]);
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
    expect(headers.get('Time-Zone')).toBeNull();
  });

  it('adds a timezone header when the request opts in', async () => {
    localStorage.setItem('access_token', 'token-1');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 })
      );

    const { fetchWithAuth } = await import('./api');
    await fetchWithAuth('/api/example', {}, true, true);

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const headers = options?.headers as Headers;
    expect(headers.get('Time-Zone')).toBeTruthy();
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
          Headers | Record<string, string> | undefined;
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

  it('shares a token refresh between concurrent fetch and axios requests', async () => {
    const {
      default: api,
      fetchWithAuth,
      setAuthTokens,
    } = await import('./api');
    setAuthTokens('expired-access', 'current-refresh');
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation((input, init) => {
        if (String(input).endsWith('/api/auth/refresh')) return refresh;
        const status =
          new Headers(init?.headers).get('Authorization') ===
          'Bearer fresh-access'
            ? 200
            : 401;
        return Promise.resolve(new Response(null, { status }));
      });
    const fetchRequest = fetchWithAuth('/api/protected');
    const axiosRequest = api.get('/api/other', {
      adapter: async (config) => {
        if (config.headers.get('Authorization') !== 'Bearer fresh-access') {
          throw responseError(config, 401);
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      },
    });
    await vi.waitFor(() => {
      expect(
        fetchMock.mock.calls.filter(([input]) =>
          String(input).endsWith('/api/auth/refresh')
        )
      ).toHaveLength(1);
    });
    resolveRefresh(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
        })
      )
    );
    expect((await fetchRequest).status).toBe(200);
    expect((await axiosRequest).status).toBe(200);
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith('/api/auth/refresh')
      )
    ).toHaveLength(1);
  });

  it('reuses a completed refresh for a late 401 from the hidden tab', async () => {
    const { default: api, setAuthTokens } = await import('./api');
    setAuthTokens('old-access', 'old-refresh');
    const refresh = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: 'fresh-access',
          refresh_token: 'fresh-refresh',
        })
      )
    );
    let rejectLate!: () => void;
    const late = api.get('/api/late', {
      adapter: async (config) => {
        if (config.headers.get('Authorization') === 'Bearer fresh-access')
          return {
            status: 200,
            statusText: 'OK',
            config,
            headers: {},
            data: {},
          };
        return new Promise((_, reject) => {
          rejectLate = () => reject(responseError(config, 401));
        });
      },
    });
    await vi.waitFor(() => expect(rejectLate).toBeDefined());
    await api.get('/api/first', {
      adapter: async (config) => {
        if (config.headers.get('Authorization') !== 'Bearer fresh-access')
          throw responseError(config, 401);
        return { status: 200, statusText: 'OK', config, headers: {}, data: {} };
      },
    });
    rejectLate();
    expect((await late).status).toBe(200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['sign out', 'sign in again'])(
    'does not restore an old session after %s',
    async (action) => {
      const { refreshAuthTokens, clearAuthTokens, setAuthTokens } =
        await import('./api');
      setAuthTokens('old-access', 'old-refresh');
      let resolveRefresh!: (response: Response) => void;
      vi.spyOn(globalThis, 'fetch').mockReturnValue(
        new Promise<Response>((resolve) => {
          resolveRefresh = resolve;
        })
      );
      const request = refreshAuthTokens();
      clearAuthTokens();
      if (action === 'sign in again')
        setAuthTokens('new-access', 'new-refresh');
      resolveRefresh(
        new Response(
          JSON.stringify({
            access_token: 'stale-access',
            refresh_token: 'stale-refresh',
          })
        )
      );
      expect(await request).toBeNull();
      expect(localStorage.getItem('access_token')).toBe(
        action === 'sign in again' ? 'new-access' : null
      );
    }
  );

  it('keeps tokens after a temporary refresh failure and allows a later retry', async () => {
    const { refreshAuthTokens, setAuthTokens } = await import('./api');
    setAuthTokens('current-access', 'current-refresh');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
          })
        )
      );
    await expect(refreshAuthTokens()).rejects.toThrow(
      'Could not load data (429)'
    );
    expect(localStorage.getItem('refresh_token')).toBe('current-refresh');
    expect(await refreshAuthTokens()).toBe('fresh-access');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears an access token when its refresh token is missing', async () => {
    const { refreshAuthTokens } = await import('./api');
    localStorage.setItem('access_token', 'expired-access');
    expect(await refreshAuthTokens()).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
  });

  it.each(['/api/auth/login', '/api/auth/refresh'])(
    'does not refresh on a 401 from %s',
    async (url) => {
      const {
        default: api,
        setAuthTokens,
        getAccessToken,
      } = await import('./api');
      const fetchMock = vi.spyOn(globalThis, 'fetch');
      setAuthTokens('current-access', 'current-refresh');
      await expect(
        api.post(
          url,
          {},
          {
            adapter: async (config) => {
              throw responseError(config, 401);
            },
          }
        )
      ).rejects.toMatchObject({ response: { status: 401 } });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getAccessToken()).toBe('current-access');
    }
  );

  it.each(['/api/auth/change-password', '/api/auth/signout-all'])(
    'refreshes expired access and retries %s once with the same body',
    async (url) => {
      const { default: api, setAuthTokens } = await import('./api');
      setAuthTokens('expired-access', 'valid-refresh');
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            access_token: 'fresh-access',
            refresh_token: 'fresh-refresh',
          }),
          { status: 200 }
        )
      );
      const authorizations: unknown[] = [];
      const body = url.endsWith('change-password')
        ? {
            current_password: 'synthetic current',
            new_password: 'synthetic replacement',
          }
        : undefined;
      const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
        authorizations.push(config.headers.get('Authorization'));
        expect(config.data).toBe(body ? JSON.stringify(body) : undefined);
        if (config.headers.get('Authorization') === 'Bearer expired-access') {
          throw responseError(config, 401);
        }
        return {
          status: 204,
          statusText: 'No Content',
          headers: {},
          config,
          data: undefined,
        };
      });
      const response = await api.post(url, body, { adapter });
      expect(response.status).toBe(204);
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(authorizations).toEqual([
        'Bearer expired-access',
        'Bearer fresh-access',
      ]);
      expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining('/api/auth/refresh'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ refresh_token: 'valid-refresh' }),
        })
      );
      expect(localStorage.getItem('access_token')).toBe('fresh-access');
      expect(localStorage.getItem('refresh_token')).toBe('fresh-refresh');
    }
  );

  it('does not refresh or clear tokens after a wrong-current-password 400', async () => {
    const { default: api, setAuthTokens } = await import('./api');
    setAuthTokens('current-access', 'current-refresh');
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw responseError(config, 400);
    });
    await expect(
      api.post(
        '/api/auth/change-password',
        {
          current_password: 'wrong',
          new_password: 'synthetic replacement',
        },
        { adapter }
      )
    ).rejects.toMatchObject({ response: { status: 400 } });
    expect(adapter).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('access_token')).toBe('current-access');
    expect(localStorage.getItem('refresh_token')).toBe('current-refresh');
  });
});
