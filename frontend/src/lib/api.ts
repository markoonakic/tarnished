import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios';

export const API_BASE = import.meta.env.VITE_API_URL || '';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const api = axios.create({
  baseURL: API_BASE,
});

function getStorage(): Storage {
  return window.localStorage;
}

export function getAccessToken(): string | null {
  return getStorage().getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return getStorage().getItem(REFRESH_TOKEN_KEY);
}

export function setAuthTokens(accessToken: string, refreshToken: string): void {
  const storage = getStorage();
  storage.setItem(ACCESS_TOKEN_KEY, accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearAuthTokens(): void {
  const storage = getStorage();
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
}

export function redirectToLogin(): void {
  window.location.href = '/login';
}

export function isAuthenticated(): boolean {
  return Boolean(getAccessToken());
}

function mergeHeaders(headers?: HeadersInit): Headers {
  return new Headers(headers);
}

function toAxiosHeaders(headers?: AxiosRequestConfig['headers']): AxiosHeaders {
  if (headers instanceof AxiosHeaders) {
    return headers;
  }

  return AxiosHeaders.from((headers ?? {}) as Record<string, string>);
}

function withAuthorization(
  headers?: HeadersInit,
  token = getAccessToken()
): Headers {
  const mergedHeaders = mergeHeaders(headers);

  if (token) {
    mergedHeaders.set('Authorization', `Bearer ${token}`);
  }

  return mergedHeaders;
}

function toAbsoluteUrl(path: string): string {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  const baseUrl = API_BASE || window.location.origin;
  return new URL(path, baseUrl).toString();
}

export async function refreshAuthTokens(): Promise<string | null> {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    return null;
  }

  const response = await fetch(toAbsoluteUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!response.ok) {
    clearAuthTokens();
    return null;
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };

  setAuthTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

export async function fetchWithAuth(
  input: string,
  init: RequestInit = {},
  retryOnUnauthorized = true
): Promise<Response> {
  const response = await fetch(toAbsoluteUrl(input), {
    ...init,
    headers: withAuthorization(init.headers),
  });

  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  const refreshedToken = await refreshAuthTokens();
  if (!refreshedToken) {
    redirectToLogin();
    return response;
  }

  return fetch(toAbsoluteUrl(input), {
    ...init,
    headers: withAuthorization(init.headers, refreshedToken),
  });
}

export function buildAuthenticatedEventSourceUrl(path: string): string {
  const url = new URL(toAbsoluteUrl(path));
  const token = getAccessToken();

  if (token) {
    url.searchParams.set('token', token);
  }

  return url.toString();
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (!token) {
    return config;
  }

  const headers = toAxiosHeaders(config.headers);
  headers.set('Authorization', `Bearer ${token}`);
  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    if (originalRequest._retry) {
      clearAuthTokens();
      redirectToLogin();
      return Promise.reject(error);
    }

    const refreshedToken = await refreshAuthTokens();
    if (!refreshedToken) {
      redirectToLogin();
      return Promise.reject(error);
    }

    originalRequest._retry = true;
    const headers = toAxiosHeaders(originalRequest.headers);
    headers.set('Authorization', `Bearer ${refreshedToken}`);
    originalRequest.headers = headers;

    return api.request(originalRequest);
  }
);

export default api;
