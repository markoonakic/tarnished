import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import api, { fetchWithAuth, freshAccessToken, setAuthTokens } from './api';

const originalAdapter = api.defaults.adapter;
const token = (expiry: number) =>
  `header.${btoa(JSON.stringify({ exp: expiry }))}.signature`;

beforeEach(() => localStorage.clear());
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('refreshes an expired token before fetch without a rejected resource or repeated write', async () => {
  const expired = token(Date.now() / 1000 - 1);
  const current = token(Date.now() / 1000 + 3600);
  setAuthTokens(expired, 'refresh-one');
  const requests: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      return new Response(
        JSON.stringify(
          url.endsWith('/api/auth/refresh')
            ? { access_token: current, refresh_token: 'refresh-two' }
            : { ok: true }
        ),
        { status: 200 }
      );
    })
  );
  const result = await fetchWithAuth('/api/analytics/feedback', {
    method: 'POST',
    body: '{}',
  });
  expect(result.status).toBe(200);
  expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
    '/api/auth/refresh',
    '/api/analytics/feedback',
  ]);
  expect(new Headers(requests[1].init?.headers).get('Authorization')).toBe(
    `Bearer ${current}`
  );
});

it('shares one early refresh across concurrent Axios and fetch reads', async () => {
  setAuthTokens(token(Date.now() / 1000 + 10), 'refresh-one');
  const current = token(Date.now() / 1000 + 3600);
  let refreshes = 0;
  const authorizations: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/auth/refresh')) {
        refreshes++;
        return new Response(
          JSON.stringify({
            access_token: current,
            refresh_token: 'refresh-two',
          })
        );
      }
      authorizations.push(new Headers(init?.headers).get('Authorization'));
      return new Response('{}');
    })
  );
  api.defaults.adapter = async (config) => {
    authorizations.push(config.headers.get('Authorization'));
    return { config, data: {}, status: 200, statusText: 'OK', headers: {} };
  };
  await Promise.all([
    api.get('/api/applications'),
    api.get('/api/rounds'),
    fetchWithAuth('/api/profile'),
  ]);
  expect(refreshes).toBe(1);
  expect(authorizations).toEqual([
    `Bearer ${current}`,
    `Bearer ${current}`,
    `Bearer ${current}`,
  ]);
});

it('leaves malformed and unexpired tokens to server authority', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  setAuthTokens('not-a-jwt', 'refresh-one');
  expect(await freshAccessToken()).toBe('not-a-jwt');
  const current = token(Date.now() / 1000 + 3600);
  setAuthTokens(current, 'refresh-one');
  expect(await freshAccessToken()).toBe(current);
  expect(fetch).not.toHaveBeenCalled();
});

it('signs in without renewing an expired old session first', async () => {
  setAuthTokens(token(Date.now() / 1000 - 60), 'stale-refresh');
  const fresh = token(Date.now() / 1000 + 3600);
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls.push(new URL(url).pathname);
      return new Response('{}', { status: 503 });
    })
  );
  const sent: { url?: string; authorization?: unknown }[] = [];
  api.defaults.adapter = async (config) => {
    sent.push({
      url: config.url,
      authorization: config.headers?.Authorization,
    });
    return {
      data: { access_token: fresh, refresh_token: 'new-refresh' },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    };
  };
  const response = await api.post('/api/auth/login', {
    email: 'a@example.com',
    password: 'secret',
  });
  expect(response.status).toBe(200);
  expect(calls).toEqual([]);
  expect(sent).toEqual([{ url: '/api/auth/login', authorization: undefined }]);
  await api.post('/api/auth/register', {
    email: 'b@example.com',
    password: 'x',
  });
  expect(calls).toEqual([]);
});
