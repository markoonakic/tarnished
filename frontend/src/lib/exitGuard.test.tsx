import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import api, { fetchWithAuth, setAuthTokens } from './api';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

function warns() {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function Draft() {
  useUnsavedChanges(true);
  return <a href="/other">Other</a>;
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  window.history.replaceState({ idx: 0 }, '', '/');
  vi.restoreAllMocks();
});

it.each([
  '/api/rounds/round',
  '/api/media/recording',
  '/api/applications/application/cv',
  '/api/applications/application/cover-letter',
  '/api/attachments/file',
  '/api/applications/application',
  '/api/job-leads/lead',
  '/api/auth/me',
])('protects pending deletion at %s without a screen guard', async (url) => {
  let release!: () => void;
  const request = api.delete(url, {
    adapter: (config) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            config,
            data: null,
            headers: {},
            status: 204,
            statusText: 'OK',
          });
      }),
  });
  await vi.waitFor(() => expect(release).toBeDefined());
  expect(warns()).toBe(true);
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  render(<a href="/other">Other</a>);
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  screen.getByText('Other').dispatchEvent(click);
  expect(click.defaultPrevented).toBe(true);
  expect(window.confirm).toHaveBeenCalledOnce();
  release();
  await request;
  expect(warns()).toBe(false);
});

it('protects Back after a permitted client link while a write is still pending', async () => {
  window.history.replaceState({ idx: 1 }, '', '/record');
  let release!: () => void;
  const request = api.delete('/api/record', {
    adapter: (config) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            config,
            data: null,
            headers: {},
            status: 204,
            statusText: 'OK',
          });
      }),
  });
  await vi.waitFor(() => expect(release).toBeDefined());
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(
    <a
      href="/other"
      onClick={(event) => {
        event.preventDefault();
        window.history.pushState({ idx: 2 }, '', '/other');
      }}
    >
      Other
    </a>
  );
  fireEvent.click(screen.getByText('Other'));
  await Promise.resolve();
  confirm.mockReturnValue(false);
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 1 } }));
  expect(confirm).toHaveBeenCalledTimes(2);
  expect(go).toHaveBeenCalledWith(1);
  window.dispatchEvent(new PopStateEvent('popstate', { state: { idx: 2 } }));
  release();
  await request;
  expect(warns()).toBe(false);
});

it('counts concurrent writes and dirty forms without duplicate warnings', async () => {
  const releases: (() => void)[] = [];
  const adapter = (config: InternalAxiosRequestConfig) =>
    new Promise<never>((_, reject) => {
      releases.push(() =>
        reject(new AxiosError('Offline', 'ERR_NETWORK', config))
      );
    });
  const first = api.post('/api/one', {}, { adapter }).catch(() => {});
  const second = api.patch('/api/two', {}, { adapter }).catch(() => {});
  await vi.waitFor(() => expect(releases).toHaveLength(2));
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const view = render(
    <>
      <Draft />
      <Draft />
    </>
  );
  fireEvent.click(screen.getAllByText('Other')[0]);
  expect(window.confirm).toHaveBeenCalledOnce();
  releases[0]();
  await first;
  expect(warns()).toBe(true);
  releases[1]();
  await second;
  expect(warns()).toBe(true);
  view.unmount();
  expect(warns()).toBe(false);
});

it.each(['post', 'put', 'patch', 'delete'])(
  'clears %s after an adapter failure with no config',
  async (method) => {
    await expect(
      api.request({
        url: '/api/write',
        method,
        adapter: async () => {
          throw new Error('Offline');
        },
      })
    ).rejects.toThrow('Offline');
    expect(warns()).toBe(false);
  }
);

it('does not block exits for an in-flight GET', async () => {
  let release!: () => void;
  const request = api.get('/api/read', {
    adapter: (config) =>
      new Promise((resolve) => {
        release = () =>
          resolve({
            config,
            data: {},
            headers: {},
            status: 200,
            statusText: 'OK',
          });
      }),
  });
  await vi.waitFor(() => expect(release).toBeDefined());
  expect(warns()).toBe(false);
  release();
  await request;
});

it.each(['success', 'failure'])(
  'protects authenticated fetch writes until %s',
  async (result) => {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    vi.spyOn(globalThis, 'fetch').mockReturnValue(
      new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      })
    );
    const request = fetchWithAuth('/api/write', { method: 'PUT' }).catch(
      () => null
    );
    expect(warns()).toBe(true);
    if (result === 'success') resolve(new Response(null, { status: 204 }));
    else reject(new Error('Offline'));
    await request;
    expect(warns()).toBe(false);
  }
);

it('keeps an axios write guarded through refresh and the unauthorized retry', async () => {
  setAuthTokens('old', 'refresh');
  let refresh!: (response: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockReturnValue(
    new Promise((resolve) => {
      refresh = resolve;
    })
  );
  let finish!: () => void;
  const request = api.delete('/api/record', {
    adapter: async (config) => {
      if (config.headers.get('Authorization') === 'Bearer old')
        throw new AxiosError('Expired', undefined, config, undefined, {
          config,
          data: {},
          headers: {},
          status: 401,
          statusText: 'Expired',
        });
      return new Promise((resolve) => {
        finish = () =>
          resolve({
            config,
            data: null,
            headers: {},
            status: 204,
            statusText: 'OK',
          });
      });
    },
  });
  await vi.waitFor(() => expect(refresh).toBeDefined());
  expect(warns()).toBe(true);
  refresh(
    new Response(
      JSON.stringify({ access_token: 'new', refresh_token: 'new-refresh' })
    )
  );
  await vi.waitFor(() => expect(finish).toBeDefined());
  expect(warns()).toBe(true);
  finish();
  await request;
  expect(warns()).toBe(false);
});
