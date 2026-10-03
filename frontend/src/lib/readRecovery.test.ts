import { AxiosError, AxiosHeaders } from 'axios';
import {
  MutationObserver,
  QueryClient,
  focusManager,
  onlineManager,
} from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { observeRead, queryClient } from './queryClient';
import {
  ReadHttpError,
  isTransientReadError,
  readRetryDelay,
  retryRead,
  refetchRead,
  recoverReadInterval,
} from './readRecovery';

const networkError = () => new AxiosError('Network Error', 'ERR_NETWORK');

afterEach(() => {
  queryClient.clear();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  vi.useRealTimers();
});

it('retries a failed read with short backoff and then succeeds', async () => {
  vi.useFakeTimers();
  const client = new QueryClient({
    defaultOptions: queryClient.getDefaultOptions(),
  });
  const load = vi
    .fn()
    .mockRejectedValueOnce(networkError())
    .mockResolvedValue('loaded');
  const result = client.fetchQuery({ queryKey: ['network'], queryFn: load });
  await vi.advanceTimersByTimeAsync(999);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toBe('loaded');
  expect(load).toHaveBeenCalledTimes(2);
  client.clear();
});

it.each([400, 401, 403, 404, 409, 422])(
  'does not retry or automatically refetch HTTP %s',
  async (status) => {
    const error = new ReadHttpError(status);
    expect(retryRead(0, error)).toBe(false);
    expect(refetchRead({ state: { status: 'error', error } })).toBe(false);
    expect(recoverReadInterval({ state: { status: 'error', error } })).toBe(
      false
    );
    const load = vi.fn().mockRejectedValue(error);
    await expect(
      queryClient.fetchQuery({ queryKey: ['terminal', status], queryFn: load })
    ).rejects.toBe(error);
    expect(load).toHaveBeenCalledTimes(1);
  }
);

it.each([408, 429, 502, 503, 504])(
  'retries HTTP %s but bounds the immediate attempts',
  (status) => {
    expect(retryRead(0, new ReadHttpError(status))).toBe(true);
    expect(retryRead(3, new ReadHttpError(status))).toBe(false);
  }
);

it('honours Retry-After and does not retry cancelled requests or invalid data', () => {
  const config = { headers: new AxiosHeaders(), method: 'get' };
  const error = new AxiosError('Busy', 'ERR_BAD_RESPONSE', config, undefined, {
    status: 429,
    statusText: 'Busy',
    config,
    headers: { 'retry-after': '15' },
    data: null,
  });
  expect(readRetryDelay(0, error)).toBe(15_000);
  expect(
    isTransientReadError(new AxiosError('Cancelled', 'ERR_CANCELED'))
  ).toBe(false);
  expect(isTransientReadError(new Error('Invalid feedback status'))).toBe(
    false
  );
});

it.each(['post', 'patch', 'put', 'delete'])(
  'never replays a %s mutation after a network failure',
  async (method) => {
    const error = new AxiosError('Network Error', 'ERR_NETWORK', {
      headers: new AxiosHeaders(),
      method,
    });
    expect(retryRead(0, error)).toBe(false);
    const write = vi.fn().mockRejectedValue(error);
    const observer = new MutationObserver(queryClient, { mutationFn: write });
    await expect(observer.mutate(undefined)).rejects.toBe(error);
    expect(write).toHaveBeenCalledTimes(1);
  }
);

it.each(['focus', 'online', 'interval'])(
  'recovers an exhausted plain read on %s and stops when unmounted',
  async (event) => {
    vi.useFakeTimers();
    let failing = true;
    const load = vi.fn(async () =>
      failing ? { error: networkError() } : undefined
    );
    const stop = observeRead(load);
    await vi.advanceTimersByTimeAsync(7001);
    expect(load).toHaveBeenCalledTimes(4);
    failing = false;
    if (event === 'focus') window.dispatchEvent(new Event('focus'));
    if (event === 'online') {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    }
    await vi.advanceTimersByTimeAsync(event === 'interval' ? 10_001 : 1);
    expect(load).toHaveBeenCalledTimes(5);
    stop();
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(load).toHaveBeenCalledTimes(5);
  }
);

it('does not replace a successful editable draft on focus, even after five minutes', async () => {
  vi.useFakeTimers();
  const load = vi.fn(async () => {});
  const stop = observeRead(load, { staleTime: Infinity });
  await vi.advanceTimersByTimeAsync(300_001);
  window.dispatchEvent(new Event('focus'));
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(1);
  stop();
});
