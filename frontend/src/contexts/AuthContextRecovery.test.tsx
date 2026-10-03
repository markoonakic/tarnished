import { act, cleanup, render, screen } from '@testing-library/react';
import { AxiosError } from 'axios';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext';
import api, { setAuthTokens, getAccessToken } from '../lib/api';
import { queryClient } from '../lib/queryClient';

function Session() {
  const { user, loading } = useAuth();
  return (
    <div>{loading ? 'Restoring session' : (user?.email ?? 'Signed out')}</div>
  );
}

afterEach(() => {
  cleanup();
  queryClient.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(['/api/auth/setup-status', '/api/auth/me'])(
  'keeps a session when %s is unavailable and restores it on focus',
  async (failedPath) => {
    vi.useFakeTimers();
    setAuthTokens('saved-access', 'saved-refresh');
    let offline = true;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (offline && path === failedPath)
        throw new AxiosError('Network Error', 'ERR_NETWORK');
      if (path === '/api/auth/setup-status')
        return { data: { needs_setup: false } };
      return { data: { id: 'owner', email: 'owner@example.test' } };
    });
    render(
      <AuthProvider>
        <Session />
      </AuthProvider>
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(7100);
    });
    expect(screen.getByText('Restoring session')).toBeVisible();
    expect(getAccessToken()).toBe('saved-access');
    expect(localStorage.getItem('refresh_token')).toBe('saved-refresh');
    offline = false;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByText('owner@example.test')).toBeVisible();
    expect(getAccessToken()).toBe('saved-access');
  }
);
