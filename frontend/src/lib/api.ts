import axios, { AxiosHeaders, type AxiosRequestConfig } from 'axios';
import { ReadHttpError } from './readRecovery';
import { uiLabel, isInterfaceText } from './i18n';
import { errorMessage } from './errorMessage';

// Validation objects can contain submitted secrets.
export function safeErrorMessage(detail: unknown, fallback: string): string {
  return typeof detail === 'string' && isInterfaceText(detail)
    ? uiLabel(detail)
    : fallback;
}

export const API_BASE = import.meta.env.VITE_API_URL || '';

const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

const api = axios.create({
  baseURL: API_BASE,
});

function getStorage(): Storage {
  return window.localStorage;
}

export function getBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return getStorage().getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
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

function redirectToLogin(): void {
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

let pendingRefresh: {
  token: string;
  promise: Promise<string | null>;
} | null = null;

export function refreshAuthTokens(): Promise<string | null> {
  const token = getRefreshToken();
  if (!token) {
    clearAuthTokens();
    return Promise.resolve(null);
  }
  if (pendingRefresh?.token === token) return pendingRefresh.promise;

  const request = {
    token,
    promise: refreshTokens(token).finally(() => {
      if (pendingRefresh === request) pendingRefresh = null;
    }),
  };
  pendingRefresh = request;
  return request.promise;
}

async function refreshTokens(refreshToken: string): Promise<string | null> {
  const response = await fetch(toAbsoluteUrl('/api/auth/refresh'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    signal: AbortSignal.timeout(10_000),
  });

  if (getRefreshToken() !== refreshToken) return null;
  if (response.status === 401 || response.status === 403) {
    clearAuthTokens();
    return null;
  }
  if (!response.ok) throw new ReadHttpError(response.status);

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
  };

  if (getRefreshToken() !== refreshToken) return null;
  setAuthTokens(data.access_token, data.refresh_token);
  return data.access_token;
}

function withTimeZoneHeaders(headers?: HeadersInit): Headers {
  const mergedHeaders = mergeHeaders(headers);
  const timeZone = getBrowserTimeZone();

  if (timeZone) {
    mergedHeaders.set('Time-Zone', timeZone);
  }

  return mergedHeaders;
}

export function withAxiosTimeZoneHeaders(
  headers?: AxiosRequestConfig['headers']
): AxiosHeaders {
  const mergedHeaders = toAxiosHeaders(headers);
  const timeZone = getBrowserTimeZone();

  if (timeZone) {
    mergedHeaders.set('Time-Zone', timeZone);
  }

  return mergedHeaders;
}

export async function fetchWithAuth(
  input: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
  includeTimeZone = false
): Promise<Response> {
  const authorizedHeaders = withAuthorization(init.headers);
  const response = await fetch(toAbsoluteUrl(input), {
    ...init,
    headers: includeTimeZone
      ? withTimeZoneHeaders(authorizedHeaders)
      : authorizedHeaders,
  });

  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  const currentToken = getAccessToken();
  const refreshedToken =
    currentToken &&
    authorizedHeaders.get('Authorization') !== `Bearer ${currentToken}`
      ? currentToken
      : await refreshAuthTokens();
  if (!refreshedToken) {
    redirectToLogin();
    return response;
  }

  const retryHeaders = withAuthorization(init.headers, refreshedToken);

  return fetch(toAbsoluteUrl(input), {
    ...init,
    headers: includeTimeZone ? withTimeZoneHeaders(retryHeaders) : retryHeaders,
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
  if (
    ['get', 'head'].includes(config.method ?? 'get') &&
    !config.timeout &&
    !['blob', 'arraybuffer'].includes(config.responseType ?? '')
  ) {
    config.timeout = 10_000;
  }
  const headers = toAxiosHeaders(config.headers);

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  config.headers = headers;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response) {
      const raw = error.response.data;
      const data = raw && typeof raw === 'object' ? raw : {};
      error.response.data = data;
      const message = errorMessage(data, error.response.status);
      if (
        data.detail &&
        typeof data.detail === 'object' &&
        !Array.isArray(data.detail)
      )
        data.detail = { ...data.detail, message };
      else data.detail = message;
    }
    if (error.response?.status !== 401) {
      return Promise.reject(error);
    }

    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      ['/api/auth/login', '/api/auth/refresh'].includes(
        originalRequest.url ?? ''
      )
    ) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      clearAuthTokens();
      redirectToLogin();
      return Promise.reject(error);
    }

    const currentToken = getAccessToken();
    const sentToken = toAxiosHeaders(originalRequest.headers).get(
      'Authorization'
    );
    const refreshedToken =
      currentToken && sentToken !== `Bearer ${currentToken}`
        ? currentToken
        : await refreshAuthTokens();
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
