import { getSettings } from './storage';
import { buildUrl } from './url';
import { debug, warn } from './logger';
import {
  AuthFailedError,
  AlreadySavedError,
  TimeoutErrorCode,
  NetworkErrorCode,
  parseBackendError,
  ExtensionError,
} from './errors';

export { ExtensionError };

export interface JobLeadResponse {
  id: string;
  title: string | null;
  company: string | null;
  url: string;
  status: 'pending' | 'extracted' | 'failed';
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  scraped_at?: string;
  error_message?: string | null;
}

export interface JobLeadListResponse {
  items: JobLeadResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface StatusResponse {
  id: string;
  name: string;
  color: string;
}

export interface ApplicationResponse {
  id: string;
  company: string;
  job_title: string;
  job_description: string | null;
  job_url: string | null;
  status: StatusResponse;
  applied_at: string;
  created_at: string;
  updated_at: string;
  cv_path: string | null;
  cover_letter_path: string | null;
  job_lead_id: string | null;
  description: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  recruiter_name: string | null;
  recruiter_linkedin_url: string | null;
  requirements_must_have: string[];
  requirements_nice_to_have: string[];
  source: string | null;
}

export interface ApplicationListResponse {
  items: ApplicationResponse[];
  total: number;
  page: number;
  per_page: number;
}

export interface ApiError {
  message: string;
  status: number;
  detail?: string;
  code?: string;
  action?: string;
}

export interface Settings {
  appUrl: string;
  apiKey: string;
}

export interface UserProfileResponse {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
}

export interface ApplicationExtractRequest {
  url: string;
  status_id: string;
  applied_at?: string;
  text?: string;
}

export const MAX_TEXT_SIZE = 100_000;
export const REQUEST_TIMEOUT_MS = 30_000;
export const API_ENDPOINTS = {
  JOB_LEADS: '/api/job-leads',
  PROFILE: '/api/profile',
  APPLICATIONS: '/api/applications',
  STATUSES: '/api/statuses',
} as const;

export class ApiClientError extends Error {
  public readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}

export class AuthenticationError extends ApiClientError {
  constructor(message: string = 'Authentication failed. Please check your API key.') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
  toExtensionError(): AuthFailedError {
    return new AuthFailedError({ cause: this });
  }
}

export class DuplicateLeadError extends ApiClientError {
  public readonly existingId?: string;
  constructor(message: string, existingId?: string) {
    super(message, 409);
    this.name = 'DuplicateLeadError';
    this.existingId = existingId;
  }
  toExtensionError(): AlreadySavedError {
    return new AlreadySavedError(this.existingId, { cause: this });
  }
}

export class TimeoutError extends ApiClientError {
  constructor(message: string = 'Request timed out. Please try again.') {
    super(message, 408);
    this.name = 'TimeoutError';
  }
  toExtensionError(): TimeoutErrorCode {
    return new TimeoutErrorCode({ cause: this });
  }
}

export class NetworkError extends ApiClientError {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message, 0);
    this.name = 'NetworkError';
  }
  toExtensionError(): NetworkErrorCode {
    return new NetworkErrorCode({ cause: this });
  }
}

export class ServerError extends ApiClientError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'ServerError';
  }
  toExtensionError(): NetworkErrorCode {
    return new NetworkErrorCode({ cause: this });
  }
}

export async function getConfiguredSettings(): Promise<Settings> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;
  if (!appUrl || !apiKey) {
    throw new AuthenticationError(
      'App URL or API key not configured. Please check your extension settings.'
    );
  }
  return settings;
}

export function truncateText(text: string): string {
  if (text.length > MAX_TEXT_SIZE) {
    warn('API', `Text content truncated from ${text.length} to ${MAX_TEXT_SIZE} characters`);
    return text.substring(0, MAX_TEXT_SIZE);
  }
  return text;
}

export function createTimeoutController(): { controller: AbortController; timeoutId: number } {
  const controller = new AbortController();
  const timeoutId = self.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeoutId };
}

export async function parseErrorResponse(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  let message = `Request failed with status ${response.status}`;
  let code: string | undefined;
  let action: string | undefined;

  try {
    const body = await response.json();
    debug('API', 'Raw error body:', JSON.stringify(body, null, 2));
    if (body.detail && typeof body.detail === 'object') {
      code = body.detail.code;
      message = body.detail.message || message;
      detail = body.detail.detail;
      action = body.detail.action;
      debug('API', 'Parsed structured error - code:', code, 'message:', message);
    } else {
      message = body.message || body.detail || message;
      detail = typeof body.detail === 'string' ? body.detail : undefined;
      debug('API', 'Parsed legacy error - message:', message);
    }
  } catch (e) {
    debug('API', 'Failed to parse error body:', e);
  }

  return { message, status: response.status, detail, code, action };
}

export function handleFetchError(error: unknown): never {
  if (error instanceof ExtensionError) throw error;
  if (error instanceof ApiClientError) throw error;
  if (error instanceof Error) {
    if (error.name === 'AbortError') throw new TimeoutError();
    throw new NetworkError(error.message);
  }
  throw new NetworkError('An unexpected error occurred');
}

export function extractExistingId(message: string): string | undefined {
  const match = message.match(/ID:\s*([a-f0-9-]+)/i);
  return match ? match[1] : undefined;
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit,
  opts: { allowStructuredErrors?: boolean; requireAuth?: boolean } = {}
): Promise<T> {
  const settings = opts.requireAuth === false ? ((await getSettings()) as Settings) : await getConfiguredSettings();
  const { appUrl, apiKey } = settings;
  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(buildUrl(appUrl, path), {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      if (opts.allowStructuredErrors && error.code) {
        throw parseBackendError({
          code: error.code,
          message: error.message,
          detail: error.detail,
          action: error.action,
        });
      }
      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) throw new ServerError(error.message, response.status);
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json() as Promise<T>;
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
