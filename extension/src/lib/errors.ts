/**
 * Typed error system for the Job Tracker extension.
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
  [ERROR_CODES.INVALID_URL]: 'Invalid server URL. Check your settings.',
  [ERROR_CODES.AUTH_FAILED]: 'Invalid API key. Get a new one from Job Tracker settings.',
  [ERROR_CODES.NETWORK]: 'Could not connect to server. Check your network.',
  [ERROR_CODES.TIMEOUT]: 'Request timed out. Try again.',
  [ERROR_CODES.NO_JOB]: 'No job posting found on this page',
  [ERROR_CODES.EXTRACTION_FAILED]: 'Could not extract job data. Try again.',
  [ERROR_CODES.ALREADY_SAVED]: 'This job is already in your leads',
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

  constructor(code: ErrorCode, options?: { cause?: Error; recoverable?: boolean }) {
    super(ERROR_MESSAGES[code]);
    this.name = 'ExtensionError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;

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
 * Error thrown when the server URL is invalid.
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
