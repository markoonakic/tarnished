/**
 * API client for communicating with the Job Tracker backend.
 *
 * This module provides functions to:
 * - Save job leads to the backend
 * - Check if a URL already exists as a job lead
 * - Handle authentication via API key
 * - Handle network errors and timeouts
 */

import { getSettings } from './storage';
import {
  AuthFailedError,
  AlreadySavedError,
  TimeoutErrorCode,
  NetworkErrorCode,
} from './errors';

// ============================================================================
// Types
// ============================================================================

/**
 * Response from the job leads API for a single lead.
 */
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

/**
 * Response from the job leads list API.
 */
export interface JobLeadListResponse {
  items: JobLeadResponse[];
  total: number;
  page: number;
  per_page: number;
}

/**
 * Status response embedded in application responses.
 */
export interface StatusResponse {
  id: string;
  name: string;
  color: string;
}

/**
 * Response from the applications API for a single application.
 */
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

/**
 * Error response from the API.
 */
export interface ApiError {
  message: string;
  status: number;
  detail?: string;
}

/**
 * Settings returned by getSettings.
 * This interface should match what storage.ts provides.
 */
interface Settings {
  appUrl: string;
  apiKey: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum text content size (100KB) */
const MAX_TEXT_SIZE = 100_000;

/** Request timeout in milliseconds (30 seconds) */
const REQUEST_TIMEOUT_MS = 30_000;

/** API endpoints */
const API_ENDPOINTS = {
  JOB_LEADS: '/api/job-leads',
  PROFILE: '/api/profile',
  APPLICATIONS: '/api/applications',
  STATUSES: '/api/statuses',
} as const;

// ============================================================================
// Error Classes
// ============================================================================

/**
 * Base error class for API errors.
 * Extends the ExtensionError system with HTTP status codes.
 */
export class ApiClientError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
  }
}


/**
 * Error thrown when authentication fails.
 * Maps to AuthFailedError in the errors module.
 */
export class AuthenticationError extends ApiClientError {
  constructor(message: string = 'Authentication failed. Please check your API key.') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }

  /**
   * Converts to an ExtensionError for user-friendly messaging.
   */
  toExtensionError(): AuthFailedError {
    return new AuthFailedError({ cause: this });
  }
}

/**
 * Error thrown when a job lead already exists.
 * Maps to AlreadySavedError in the errors module.
 */
export class DuplicateLeadError extends ApiClientError {
  public readonly existingId?: string;

  constructor(message: string, existingId?: string) {
    super(message, 409);
    this.name = 'DuplicateLeadError';
    this.existingId = existingId;
  }

  /**
   * Converts to an ExtensionError for user-friendly messaging.
   */
  toExtensionError(): AlreadySavedError {
    return new AlreadySavedError(this.existingId, { cause: this });
  }
}

/**
 * Error thrown when the request times out.
 * Maps to TimeoutErrorCode in the errors module.
 */
export class TimeoutError extends ApiClientError {
  constructor(message: string = 'Request timed out. Please try again.') {
    super(message, 408);
    this.name = 'TimeoutError';
  }

  /**
   * Converts to an ExtensionError for user-friendly messaging.
   */
  toExtensionError(): TimeoutErrorCode {
    return new TimeoutErrorCode({ cause: this });
  }
}

/**
 * Error thrown when there's a network error.
 * Maps to NetworkErrorCode in the errors module.
 */
export class NetworkError extends ApiClientError {
  constructor(message: string = 'Network error. Please check your connection.') {
    super(message, 0);
    this.name = 'NetworkError';
  }

  /**
   * Converts to an ExtensionError for user-friendly messaging.
   */
  toExtensionError(): NetworkErrorCode {
    return new NetworkErrorCode({ cause: this });
  }
}

/**
 * Error thrown when the server returns an error.
 * Maps to NetworkErrorCode in the errors module.
 */
export class ServerError extends ApiClientError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'ServerError';
  }

  /**
   * Converts to an ExtensionError for user-friendly messaging.
   */
  toExtensionError(): NetworkErrorCode {
    return new NetworkErrorCode({ cause: this });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Truncates text content if it exceeds the maximum size.
 * @param text - The text content to truncate
 * @returns Truncated text content
 */
function truncateText(text: string): string {
  if (text.length > MAX_TEXT_SIZE) {
    console.warn(`Text content truncated from ${text.length} to ${MAX_TEXT_SIZE} characters`);
    return text.substring(0, MAX_TEXT_SIZE);
  }
  return text;
}

/**
 * Creates an AbortController with a timeout.
 * @returns Object with controller and timeoutId
 */
function createTimeoutController(): {
  controller: AbortController;
  timeoutId: number;
} {
  const controller = new AbortController();
  const timeoutId = self.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, timeoutId };
}

/**
 * Parses an error response from the API.
 * @param response - The fetch Response object
 * @returns ApiError with parsed details
 */
async function parseErrorResponse(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  let message = `Request failed with status ${response.status}`;

  try {
    const body = await response.json();
    detail = body.detail || body.message;
    if (detail) {
      message = detail;
    }
  } catch {
    // Ignore JSON parsing errors
  }

  return {
    message,
    status: response.status,
    detail,
  };
}

/**
 * Handles different types of fetch errors and throws appropriate error classes.
 * @param error - The caught error
 * @throws Appropriate error class based on the error type
 */
function handleFetchError(error: unknown): never {
  if (error instanceof ApiClientError) {
    throw error;
  }

  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      throw new TimeoutError();
    }
    throw new NetworkError(error.message);
  }

  throw new NetworkError('An unexpected error occurred');
}

/**
 * Extracts the existing lead ID from a 409 Conflict error message.
 * @param message - The error message from the API
 * @returns The existing lead ID if found, undefined otherwise
 */
function extractExistingId(message: string): string | undefined {
  const match = message.match(/ID:\s*([a-f0-9-]+)/i);
  return match ? match[1] : undefined;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Saves a job lead to the backend.
 *
 * @param url - The URL of the job posting
 * @param text - The text content of the job posting (will be truncated if too large)
 * @returns The created job lead response
 * @throws AuthenticationError if the API key is invalid
 * @throws DuplicateLeadError if a job lead already exists for this URL
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 * @throws ServerError if the server returns an error
 */
export async function saveJobLead(url: string, text: string): Promise<JobLeadResponse> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
  }

  const truncatedText = truncateText(text);
  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${appUrl}${API_ENDPOINTS.JOB_LEADS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ url, text: truncatedText }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 409: {
          const existingId = extractExistingId(error.message);
          throw new DuplicateLeadError(error.message, existingId);
        }
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) {
            throw new ServerError(error.message, response.status);
          }
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json();
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Checks if a job lead already exists for the given URL.
 *
 * @param url - The URL to check
 * @returns The existing job lead if found, null otherwise
 * @throws AuthenticationError if the API key is invalid
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 */
export async function checkExistingLead(url: string): Promise<JobLeadResponse | null> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(
      `${appUrl}${API_ENDPOINTS.JOB_LEADS}?search=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      // For check operations, we don't throw on auth errors - just return null
      // The actual save will fail with proper error message
      if (response.status === 401) {
        return null;
      }

      const error = await parseErrorResponse(response);
      console.warn('Failed to check existing lead:', error.message);
      return null;
    }

    const data: JobLeadListResponse = await response.json();

    // Find exact URL match
    const exactMatch = data.items.find((lead) => lead.url === url);
    return exactMatch || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError();
    }

    // For check operations, log and return null instead of throwing
    console.warn('Error checking existing lead:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Response from the applications list API (paginated).
 */
export interface ApplicationListResponse {
  items: ApplicationResponse[];
  total: number;
  page: number;
  per_page: number;
}

/**
 * Check if a URL already exists as an application for the current user.
 *
 * @param url - The URL to check
 * @returns The existing application if found, null otherwise
 */
export async function checkExistingApplication(url: string): Promise<ApplicationResponse | null> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    return null;
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(
      `${appUrl}${API_ENDPOINTS.APPLICATIONS}?url=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        return null;
      }
      console.warn('Failed to check existing application:', response.status);
      return null;
    }

    const data: ApplicationListResponse = await response.json();

    // Find exact URL match
    const exactMatch = data.items.find((app) => app.job_url === url);
    return exactMatch || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    console.warn('Error checking existing application:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Convert a job lead to an application.
 *
 * @param leadId - The ID of the job lead to convert
 * @returns The created application
 * @throws AuthenticationError if the API key is invalid
 * @throws ApiClientError if the conversion fails
 */
export async function convertLeadToApplication(leadId: string): Promise<ApplicationResponse> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(
      `${appUrl}${API_ENDPOINTS.JOB_LEADS}/${leadId}/convert`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      throw new ApiClientError(error.message, response.status);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * User profile response from the API.
 */
export interface UserProfileResponse {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  linkedin_url: string | null;
}

/**
 * Fetches the user's profile from the backend.
 *
 * @returns The user profile response
 * @throws AuthenticationError if the API key is invalid
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 */
export async function getProfile(): Promise<UserProfileResponse> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${appUrl}${API_ENDPOINTS.PROFILE}`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) {
            throw new ServerError(error.message, response.status);
          }
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json();
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tests the API connection with the current settings.
 *
 * @returns true if connection is successful
 * @throws AuthenticationError if the API key is invalid
 * @throws NetworkError if there's a network error
 */
export async function testConnection(): Promise<boolean> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured.');
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    // Try to list job leads with minimal page size
    const response = await fetch(
      `${appUrl}${API_ENDPOINTS.JOB_LEADS}?per_page=1`,
      {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new AuthenticationError('Invalid API key.');
      }
      throw new NetworkError(`Server returned status ${response.status}`);
    }

    return true;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError('Connection test timed out.');
    }

    throw new NetworkError(error instanceof Error ? error.message : 'Connection failed');
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Create an application directly (skipping job lead conversion).
 *
 * @param data - The application data to create
 * @param data.status_id - UUID of the status to use (e.g., "Applied" status)
 * @returns The created application response
 * @throws AuthenticationError if the API key is invalid
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 * @throws ServerError if the server returns an error
 */
export async function createApplicationFromJob(data: {
  job_title: string;
  company: string;
  status_id: string;
  job_url?: string;
  job_description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  applied_at?: string;
}): Promise<ApplicationResponse> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError(
      'App URL or API key not configured. Please check your extension settings.'
    );
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${appUrl}${API_ENDPOINTS.APPLICATIONS}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        job_title: data.job_title,
        company: data.company,
        status_id: data.status_id,
        job_url: data.job_url || null,
        job_description: data.job_description || null,
        salary_min: data.salary_min || null,
        salary_max: data.salary_max || null,
        salary_currency: data.salary_currency || null,
        applied_at: data.applied_at || new Date().toISOString().split('T')[0],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) {
            throw new ServerError(error.message, response.status);
          }
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json();
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Request to extract job data from URL and create an application.
 */
export interface ApplicationExtractRequest {
  url: string;
  status_id: string;
  applied_at?: string;
  text?: string; // Optional page text content - recommended for better extraction
}

/**
 * Extract job data from URL using LLM and create an application.
 *
 * @param data - The extraction request data
 * @param data.url - The URL of the job posting to extract
 * @param data.status_id - UUID of the status to use (e.g., "Applied" status)
 * @param data.applied_at - Optional applied date (defaults to today)
 * @returns The created application response
 * @throws AuthenticationError if the API key is invalid
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 * @throws ServerError if the server returns an error
 */
export async function extractApplication(
  data: ApplicationExtractRequest
): Promise<ApplicationResponse> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError(
      'App URL or API key not configured. Please check your extension settings.'
    );
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${appUrl}${API_ENDPOINTS.APPLICATIONS}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        url: data.url,
        status_id: data.status_id,
        applied_at: data.applied_at || new Date().toISOString().split('T')[0],
        text: data.text ? truncateText(data.text) : undefined,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) {
            throw new ServerError(error.message, response.status);
          }
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json();
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the list of application statuses from the backend.
 *
 * @returns Array of status objects with id, name, color, is_default, order
 * @throws AuthenticationError if the API key is invalid
 * @throws TimeoutError if the request times out
 * @throws NetworkError if there's a network error
 */
export async function getStatuses(): Promise<StatusResponse[]> {
  const settings = (await getSettings()) as Settings;
  const { appUrl, apiKey } = settings;

  if (!appUrl || !apiKey) {
    throw new AuthenticationError('App URL or API key not configured. Please check your extension settings.');
  }

  const { controller, timeoutId } = createTimeoutController();

  try {
    const response = await fetch(`${appUrl}${API_ENDPOINTS.STATUSES}`, {
      method: 'GET',
      headers: {
        'X-API-Key': apiKey,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);

      switch (response.status) {
        case 401:
          throw new AuthenticationError(error.detail);
        case 408:
          throw new TimeoutError(error.detail);
        default:
          if (response.status >= 500) {
            throw new ServerError(error.message, response.status);
          }
          throw new ApiClientError(error.message, response.status);
      }
    }

    return response.json();
  } catch (error) {
    handleFetchError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
