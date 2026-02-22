/**
 * Typed error system for the Tarnished extension.
 *
 * This module provides:
 * - Standardized error codes for all extension errors
 * - User-friendly error messages
 * - ExtensionError class for consistent error handling
 * - Helper functions for error classification
 */

// V8-specific stack trace capture (available in Chrome/Node.js)
declare global {
  interface ErrorConstructor {
    captureStackTrace?(targetObject: object, constructorOpt?: Function): void;
  }
}

// ============================================================================
// Error Codes
// ============================================================================

/**
 * Standard error codes for the extension.
 * These codes map to specific user-friendly messages.
 */
export const ERROR_CODES = {
  NO_SETTINGS: 'ERR_NO_SETTINGS',
  INVALID_URL: 'ERR_INVALID_URL',
  AUTH_FAILED: 'ERR_AUTH_FAILED',
  NETWORK: 'ERR_NETWORK',
  TIMEOUT: 'ERR_TIMEOUT',
  NO_JOB: 'ERR_NO_JOB',
  EXTRACTION_FAILED: 'ERR_EXTRACTION_FAILED',
  ALREADY_SAVED: 'ERR_ALREADY_SAVED',
  // AI-specific errors from backend
  AI_KEY_NOT_CONFIGURED: 'AI_KEY_NOT_CONFIGURED',
  AI_KEY_INVALID: 'AI_KEY_INVALID',
  AI_RATE_LIMITED: 'AI_RATE_LIMITED',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_SERVICE_ERROR: 'AI_SERVICE_ERROR',
  AI_EXTRACTION_FAILED: 'AI_EXTRACTION_FAILED',
  // Auth errors from backend
  AUTH_INVALID_API_KEY: 'AUTH_INVALID_API_KEY',
  // Resource errors from backend
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// ============================================================================
// Error Messages
// ============================================================================

/**
 * User-friendly error messages mapped to error codes.
 */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.NO_SETTINGS]: 'Configure the extension in settings first',
  [ERROR_CODES.INVALID_URL]: 'Invalid app URL. Check your settings.',
  [ERROR_CODES.AUTH_FAILED]:
    'Invalid API key. Get a new one from Tarnished settings.',
  [ERROR_CODES.NETWORK]: 'Could not connect to server. Check your network.',
  [ERROR_CODES.TIMEOUT]: 'Request timed out. Try again.',
  [ERROR_CODES.NO_JOB]: 'No job posting found on this page',
  [ERROR_CODES.EXTRACTION_FAILED]: 'Could not extract job data. Try again.',
  [ERROR_CODES.ALREADY_SAVED]: 'This job is already in your leads',
  // AI-specific errors
  [ERROR_CODES.AI_KEY_NOT_CONFIGURED]: 'AI extraction requires an API key',
  [ERROR_CODES.AI_KEY_INVALID]: 'AI API key is invalid',
  [ERROR_CODES.AI_RATE_LIMITED]: 'AI service is rate limited',
  [ERROR_CODES.AI_TIMEOUT]: 'AI request timed out',
  [ERROR_CODES.AI_SERVICE_ERROR]: 'AI service error',
  [ERROR_CODES.AI_EXTRACTION_FAILED]:
    'Could not extract job data from this page',
  // Auth errors from backend
  [ERROR_CODES.AUTH_INVALID_API_KEY]: 'Invalid API key',
  // Resource errors from backend
  [ERROR_CODES.DUPLICATE_RESOURCE]: 'This resource already exists',
};

/**
 * Suggested actions for error codes.
 * Used to show actionable guidance to users.
 */
export const ERROR_ACTIONS: Partial<Record<ErrorCode, string>> = {
  [ERROR_CODES.AI_KEY_NOT_CONFIGURED]:
    'Add your API key in Settings → AI Configuration',
  [ERROR_CODES.AI_KEY_INVALID]:
    'Check your API key in Settings → AI Configuration',
  [ERROR_CODES.AI_RATE_LIMITED]: 'Wait a moment and try again',
  [ERROR_CODES.AI_TIMEOUT]: 'Try again - the service may be slow',
  [ERROR_CODES.AI_SERVICE_ERROR]: 'Try again later',
  [ERROR_CODES.AI_EXTRACTION_FAILED]:
    'Make sure the page is a valid job posting',
  [ERROR_CODES.AUTH_FAILED]: 'Get a new API key from Settings → API Key',
};

// ============================================================================
// Extension Error Class
// ============================================================================

/**
 * Base error class for extension errors.
 * Provides error codes and user-friendly messages.
 */
export class ExtensionError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly action: string | undefined;

  constructor(
    code: ErrorCode,
    options?: { cause?: Error; recoverable?: boolean; action?: string }
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ExtensionError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
    this.action = options?.action ?? ERROR_ACTIONS[code];

    // Set cause if provided (ES2022 feature, but we handle it manually for compatibility)
    if (options?.cause) {
      (this as { cause?: Error }).cause = options.cause;
    }

    // Maintains proper stack trace for where error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ExtensionError);
    }
  }

  /**
   * Gets the user-friendly message for this error.
   */
  get userMessage(): string {
    return this.message;
  }

  /**
   * Gets the suggested action for this error.
   */
  get userAction(): string | undefined {
    return this.action;
  }
}

// ============================================================================
// Specific Error Classes
// ============================================================================

/**
 * Error thrown when settings are not configured.
 */
export class NoSettingsError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.NO_SETTINGS, { ...options, recoverable: true });
    this.name = 'NoSettingsError';
  }
}

/**
 * Error thrown when the app URL is invalid.
 */
export class InvalidUrlError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.INVALID_URL, { ...options, recoverable: true });
    this.name = 'InvalidUrlError';
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthFailedError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AUTH_FAILED, { ...options, recoverable: true });
    this.name = 'AuthFailedError';
  }
}

/**
 * Error thrown when there's a network error.
 */
export class NetworkErrorCode extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.NETWORK, { ...options, recoverable: true });
    this.name = 'NetworkErrorCode';
  }
}

/**
 * Error thrown when a request times out.
 */
export class TimeoutErrorCode extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.TIMEOUT, { ...options, recoverable: true });
    this.name = 'TimeoutErrorCode';
  }
}

/**
 * Error thrown when no job posting is detected.
 */
export class NoJobError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.NO_JOB, { ...options, recoverable: false });
    this.name = 'NoJobError';
  }
}

/**
 * Error thrown when job data extraction fails.
 */
export class ExtractionFailedError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.EXTRACTION_FAILED, { ...options, recoverable: true });
    this.name = 'ExtractionFailedError';
  }
}

/**
 * Error thrown when a job lead already exists.
 */
export class AlreadySavedError extends ExtensionError {
  public readonly existingId?: string;

  constructor(existingId?: string, options?: { cause?: Error }) {
    super(ERROR_CODES.ALREADY_SAVED, { ...options, recoverable: false });
    this.name = 'AlreadySavedError';
    this.existingId = existingId;
  }
}

// ============================================================================
// AI-Specific Errors
// ============================================================================

/**
 * Error thrown when AI API key is not configured.
 */
export class AIKeyNotConfiguredError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_KEY_NOT_CONFIGURED, { ...options, recoverable: true });
    this.name = 'AIKeyNotConfiguredError';
  }
}

/**
 * Error thrown when AI API key is invalid.
 */
export class AIKeyInvalidError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_KEY_INVALID, { ...options, recoverable: true });
    this.name = 'AIKeyInvalidError';
  }
}

/**
 * Error thrown when AI service is rate limited.
 */
export class AIRateLimitedError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_RATE_LIMITED, { ...options, recoverable: true });
    this.name = 'AIRateLimitedError';
  }
}

/**
 * Error thrown when AI request times out.
 */
export class AITimeoutError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_TIMEOUT, { ...options, recoverable: true });
    this.name = 'AITimeoutError';
  }
}

/**
 * Error thrown when AI service has an error.
 */
export class AIServiceError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_SERVICE_ERROR, { ...options, recoverable: true });
    this.name = 'AIServiceError';
  }
}

/**
 * Error thrown when AI extraction fails.
 */
export class AIExtractionFailedError extends ExtensionError {
  constructor(options?: { cause?: Error }) {
    super(ERROR_CODES.AI_EXTRACTION_FAILED, { ...options, recoverable: true });
    this.name = 'AIExtractionFailedError';
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Maps an unknown error to a user-friendly message.
 * @param error - The error to map
 * @returns User-friendly error message
 */
export function getErrorMessage(error: unknown): string {
  // If it's already an ExtensionError, use its message
  if (error instanceof ExtensionError) {
    return error.userMessage;
  }

  // If it's an Error with a message, return that
  if (error instanceof Error) {
    return error.message;
  }

  // Fallback for unknown error types
  return 'An unexpected error occurred';
}

/**
 * Checks if an error is recoverable (user can retry).
 * @param error - The error to check
 * @returns True if the error is recoverable
 */
export function isRecoverable(error: unknown): boolean {
  if (error instanceof ExtensionError) {
    return error.recoverable;
  }
  // Default to recoverable for unknown errors
  return true;
}

/**
 * Maps API errors to ExtensionErrors.
 * @param error - The error from the API client
 * @returns An appropriate ExtensionError
 */
export function mapApiError(error: unknown): ExtensionError {
  // Import types dynamically to avoid circular dependencies
  // The actual classes are checked at runtime via instanceof

  // Already an ExtensionError
  if (error instanceof ExtensionError) {
    return error;
  }

  // Map specific error names to ExtensionErrors
  if (error instanceof Error) {
    const errorName = error.constructor.name;

    switch (errorName) {
      case 'AuthenticationError':
        return new AuthFailedError({ cause: error });
      case 'DuplicateLeadError':
        // Extract existing ID if available
        const match = error.message.match(/ID:\s*([a-f0-9-]+)/i);
        return new AlreadySavedError(match?.[1], { cause: error });
      case 'TimeoutError':
        return new TimeoutErrorCode({ cause: error });
      case 'NetworkError':
        return new NetworkErrorCode({ cause: error });
      case 'ServerError':
        return new NetworkErrorCode({ cause: error });
      case 'ApiClientError':
        // 422 and other client errors from API - likely extraction failures
        return new ExtractionFailedError({ cause: error });
      default:
        // For other errors, create a generic network error
        return new NetworkErrorCode({ cause: error });
    }
  }

  // Unknown error type
  return new NetworkErrorCode();
}

/**
 * Parses a backend error response and returns the appropriate ExtensionError.
 *
 * Backend responses have the format:
 * {
 *   "code": "AI_KEY_NOT_CONFIGURED",
 *   "message": "AI extraction requires an API key",
 *   "detail": "...",
 *   "action": "Add your API key in Settings → AI Configuration"
 * }
 *
 * @param response - The parsed JSON response from the backend
 * @returns An appropriate ExtensionError
 */
export function parseBackendError(response: {
  code?: string;
  message?: string;
  detail?: string;
  action?: string;
}): ExtensionError {
  const code = response.code as ErrorCode | undefined;

  // Map backend error codes to specific error classes
  switch (code) {
    case ERROR_CODES.AI_KEY_NOT_CONFIGURED:
      return new AIKeyNotConfiguredError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AI_KEY_INVALID:
      return new AIKeyInvalidError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AI_RATE_LIMITED:
      return new AIRateLimitedError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AI_TIMEOUT:
      return new AITimeoutError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AI_SERVICE_ERROR:
      return new AIServiceError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AI_EXTRACTION_FAILED:
      return new AIExtractionFailedError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.AUTH_INVALID_API_KEY:
    case ERROR_CODES.AUTH_FAILED:
      return new AuthFailedError({
        cause: new Error(response.detail || response.message),
      });
    case ERROR_CODES.DUPLICATE_RESOURCE:
      const match = (response.detail || response.message || '').match(
        /ID:\s*([a-f0-9-]+)/i
      );
      return new AlreadySavedError(match?.[1], {
        cause: new Error(response.message),
      });
    case ERROR_CODES.NETWORK:
    case ERROR_CODES.TIMEOUT:
      return new TimeoutErrorCode({
        cause: new Error(response.detail || response.message),
      });
    default:
      // Unknown or missing error code - use network error with the message
      return new NetworkErrorCode({
        cause: new Error(response.message || 'Unknown error'),
      });
  }
}
