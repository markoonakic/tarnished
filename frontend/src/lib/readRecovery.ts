import axios from 'axios';
import type { QueryState } from '@tanstack/react-query';

type ReadQuery = { state: Pick<QueryState, 'status' | 'error'> };

const transientStatuses = new Set([408, 429, 502, 503, 504]);

export function isTransientReadError(error: unknown): boolean {
  if (axios.isCancel(error)) return false;
  if (axios.isAxiosError(error)) {
    // A query must never replay a write, even if a caller misclassifies it.
    const method = error.config?.method?.toUpperCase();
    if (method && method !== 'GET' && method !== 'HEAD') return false;
    return error.response
      ? transientStatuses.has(error.response.status)
      : ['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code ?? '');
  }
  if (error instanceof ReadHttpError)
    return transientStatuses.has(error.status);
  // fetch rejects with TypeError for a network failure.
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
  );
}

export class ReadHttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Could not load data (${status})`);
    this.status = status;
  }
}

export function retryRead(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && isTransientReadError(error);
}

export function readRetryDelay(attempt: number, error: unknown): number {
  const header = axios.isAxiosError(error)
    ? error.response?.headers?.['retry-after']
    : undefined;
  if (header) {
    const seconds = Number(header);
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(String(header)) - Date.now();
    if (Number.isFinite(delay)) return Math.max(1000, Math.min(delay, 60_000));
  }
  return Math.min(1000 * 2 ** attempt, 5000);
}

export function refetchRead(query: ReadQuery): boolean | 'always' {
  if (query.state.status === 'error')
    return isTransientReadError(query.state.error) ? 'always' : false;
  return true;
}

export function recoverReadInterval(query: ReadQuery): number | false {
  return query.state.status === 'error' &&
    isTransientReadError(query.state.error)
    ? Math.max(10_000, readRetryDelay(0, query.state.error))
    : false;
}
