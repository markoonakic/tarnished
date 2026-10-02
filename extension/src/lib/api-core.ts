import { getSettings, type Settings } from './storage';
import { buildUrl } from './url';
import { warn } from './logger';
import { extractDuplicateResourceId } from './error-mapping';
import { NoSettingsError, parseBackendError, ExtensionError } from './errors';

export interface JobLeadResponse {
  id: string;
  title: string | null;
  company: string | null;
  url: string;
  status: 'pending' | 'processing' | 'extracted' | 'failed' | 'converted';
  revision: number;
  source_text: string | null;
  source_truncated: boolean;
  content_warning: string | null;
  converted_to_application_id: string | null;
  location?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  source?: string | null;
  scraped_at?: string;
  error_message?: string | null;
}

export type JobLeadListItem = Omit<
  JobLeadResponse,
  'revision' | 'source_text' | 'source_truncated' | 'content_warning'
>;

export interface JobLeadListResponse {
  items: JobLeadListItem[];
  total: number;
  page: number;
  per_page: number;
}

interface StatusResponse {
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

interface ApiError {
  id?: string;
  message: string;
  status: number;
  detail?: string;
  code?: string;
  action?: string;
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

const MAX_TEXT_SIZE = 100_000;
const REQUEST_TIMEOUT_MS = 30_000;
export const API_ENDPOINTS = {
  JOB_LEADS: '/api/job-leads',
  PROFILE: '/api/profile',
  APPLICATIONS: '/api/applications',
  USER_SETTINGS: '/api/users/settings',
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
  constructor(
    message: string = 'Authentication failed. Please check your API key.'
  ) {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class DuplicateLeadError extends ApiClientError {
  public readonly existingId?: string;
  constructor(message: string, existingId?: string) {
    super(message, 409);
    this.name = 'DuplicateLeadError';
    this.existingId = existingId;
  }
}

export class TimeoutError extends ApiClientError {
  constructor(message: string = 'Request timed out. Please try again.') {
    super(message, 408);
    this.name = 'TimeoutError';
  }
}

class NetworkError extends ApiClientError {
  constructor(
    message: string = 'Network error. Please check your connection.'
  ) {
    super(message, 0);
    this.name = 'NetworkError';
  }
}

class ServerError extends ApiClientError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'ServerError';
  }
}

async function getConfiguredSettings(): Promise<Settings> {
  const settings = await getSettings();
  const { appUrl, apiKey } = settings;
  if (!appUrl || !apiKey) {
    throw new NoSettingsError();
  }
  return settings;
}

export function truncateText(text: string): string {
  if (text.length > MAX_TEXT_SIZE) {
    warn(
      'API',
      `Text content truncated from ${text.length} to ${MAX_TEXT_SIZE} characters`
    );
    return text.substring(0, MAX_TEXT_SIZE);
  }
  return text;
}

function createTimeoutController(): {
  controller: AbortController;
  timeoutId: number;
} {
  const controller = new AbortController();
  const timeoutId = self.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );
  return { controller, timeoutId };
}

async function parseErrorResponse(response: Response): Promise<ApiError> {
  const fallback = `Request failed with status ${response.status}`;
  try {
    const body = await response.json();
    const detail = body?.detail;
    if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
      return {
        status: response.status,
        message: typeof detail.message === 'string' ? detail.message : fallback,
        id: typeof detail.id === 'string' ? detail.id : undefined,
        code: typeof detail.code === 'string' ? detail.code : undefined,
        detail: typeof detail.detail === 'string' ? detail.detail : undefined,
        action: typeof detail.action === 'string' ? detail.action : undefined,
      };
    }
    return {
      status: response.status,
      message:
        typeof body?.message === 'string'
          ? body.message
          : typeof detail === 'string'
            ? detail
            : fallback,
    };
  } catch {
    return { status: response.status, message: fallback };
  }
}

function handleFetchError(error: unknown): never {
  if (error instanceof ExtensionError) throw error;
  if (error instanceof ApiClientError) throw error;
  if (error instanceof Error || error instanceof DOMException) {
    if (error.name === 'AbortError') throw new TimeoutError();
    throw new NetworkError();
  }
  throw new NetworkError('An unexpected error occurred');
}

export async function fetchJson<T>(
  path: string,
  init: RequestInit,
  opts: { allowStructuredErrors?: boolean } = {}
): Promise<T> {
  const settings = await getConfiguredSettings();
  const { appUrl, apiKey } = settings;
  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(buildUrl(appUrl, path), {
      ...init,
      headers: {
        ...Object.fromEntries(new Headers(init.headers).entries()),
        'x-api-key': apiKey,
      },
      signal: controller.signal,
      redirect: 'error',
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      if (response.status === 409 && error.code === 'DUPLICATE_RESOURCE') {
        throw new DuplicateLeadError(
          error.message,
          error.id ??
            extractDuplicateResourceId(error.detail ?? error.message) ??
            undefined
        );
      }
      if (opts.allowStructuredErrors && error.code) {
        const structured = parseBackendError({
          code: error.code,
          message: error.message,
          detail: error.detail,
          action: error.action,
        });
        if (structured) throw structured;
      }
      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.message);
        case 408:
          throw new TimeoutError(error.message);
        default:
          if (response.status >= 500)
            throw new ServerError(error.message, response.status);
          throw new ApiClientError(error.message, response.status);
      }
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new ApiClientError(
          'Server returned an invalid JSON response.',
          response.status
        );
      }
      throw error;
    }
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
