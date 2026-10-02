import {
  extractDuplicateResourceId,
  mapApiErrorNameToCode,
} from './error-mapping';

const ERROR_MESSAGES = {
  ERR_NO_SETTINGS: 'Configure the extension in settings first',
  ERR_INVALID_URL:
    'Invalid app URL. Use an HTTP or HTTPS URL without credentials.',
  ERR_AUTH_FAILED: 'Invalid API key. Get a new one from Tarnished settings.',
  ERR_NETWORK: 'Could not connect to server. Check your network and app URL.',
  ERR_TIMEOUT: 'Request timed out. Try again.',
  ERR_EXTRACTION_FAILED: 'Could not extract job data. Try again.',
  ERR_ALREADY_SAVED: 'This job is already in your leads',
  AI_KEY_NOT_CONFIGURED: 'AI extraction requires an API key',
  AI_KEY_INVALID: 'AI API key is invalid',
  AI_RATE_LIMITED: 'AI service is rate limited',
  AI_TIMEOUT: 'AI request timed out',
  AI_SERVICE_ERROR: 'AI service error',
  AI_EXTRACTION_FAILED: 'Could not extract job data from this page',
} as const;

type ErrorCode = keyof typeof ERROR_MESSAGES;

const ERROR_ACTIONS: Partial<Record<ErrorCode, string>> = {
  AI_KEY_NOT_CONFIGURED: 'Add your API key in Settings → AI Configuration',
  AI_KEY_INVALID: 'Check your API key in Settings → AI Configuration',
  AI_RATE_LIMITED: 'Wait a moment and try again',
  AI_TIMEOUT: 'Try again - the service may be slow',
  AI_SERVICE_ERROR: 'Try again later',
  AI_EXTRACTION_FAILED: 'Make sure the page is a valid job posting',
  ERR_AUTH_FAILED: 'Get a new API key from Settings → API Key',
};

type ErrorOptions = {
  cause?: Error;
  recoverable?: boolean;
  action?: string;
  message?: string;
};

export class ExtensionError extends Error {
  public readonly code: ErrorCode;
  public readonly recoverable: boolean;
  public readonly action: string | undefined;
  public readonly cause?: Error;

  constructor(code: ErrorCode, options?: ErrorOptions) {
    super(options?.message ?? ERROR_MESSAGES[code]);
    this.cause = options?.cause;
    this.name = 'ExtensionError';
    this.code = code;
    this.recoverable = options?.recoverable ?? false;
    this.action = options?.action ?? ERROR_ACTIONS[code];
  }
}

export class NoSettingsError extends ExtensionError {
  constructor() {
    super('ERR_NO_SETTINGS', { recoverable: true });
    this.name = 'NoSettingsError';
  }
}

export class InvalidUrlError extends ExtensionError {
  constructor() {
    super('ERR_INVALID_URL', { recoverable: true });
    this.name = 'InvalidUrlError';
  }
}

class AuthFailedError extends ExtensionError {
  constructor(options?: ErrorOptions) {
    super('ERR_AUTH_FAILED', { ...options, recoverable: true });
    this.name = 'AuthFailedError';
  }
}

class NetworkErrorCode extends ExtensionError {
  constructor(options?: ErrorOptions) {
    super('ERR_NETWORK', { ...options, recoverable: true });
    this.name = 'NetworkErrorCode';
  }
}

class TimeoutErrorCode extends ExtensionError {
  constructor(options?: ErrorOptions) {
    super('ERR_TIMEOUT', { ...options, recoverable: true });
    this.name = 'TimeoutErrorCode';
  }
}

export class AlreadySavedError extends ExtensionError {
  public readonly existingId?: string;

  constructor(existingId?: string, options?: ErrorOptions) {
    super('ERR_ALREADY_SAVED', { ...options, recoverable: false });
    this.name = 'AlreadySavedError';
    this.existingId = existingId;
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ExtensionError && error.action) {
    return `${error.message} ${error.action}`;
  }
  return error instanceof Error
    ? error.message
    : 'An unexpected error occurred';
}

export function isRecoverable(error: unknown): boolean {
  return error instanceof ExtensionError ? error.recoverable : true;
}

export function mapApiError(error: unknown): ExtensionError {
  if (error instanceof ExtensionError) return error;
  if (!(error instanceof Error)) return new NetworkErrorCode();

  switch (mapApiErrorNameToCode(error.name)) {
    case 'ERR_AUTH_FAILED':
      return new AuthFailedError({ cause: error });
    case 'ERR_ALREADY_SAVED':
      return new AlreadySavedError(
        (error as Error & { existingId?: string }).existingId ??
          extractDuplicateResourceId(error.message) ??
          undefined,
        { cause: error }
      );
    case 'ERR_TIMEOUT':
      return new TimeoutErrorCode({ cause: error });
    case 'ERR_EXTRACTION_FAILED':
      // Validation and scope errors already carry the server's useful message.
      return new ExtensionError('ERR_EXTRACTION_FAILED', {
        cause: error,
        recoverable: true,
        message: error.message,
      });
    default:
      return new NetworkErrorCode({ cause: error });
  }
}

export function parseBackendError(response: {
  code: string;
  message: string;
  detail?: string;
  action?: string;
}): ExtensionError | null {
  const options = {
    cause: new Error(response.detail || response.message),
    recoverable: true,
    action: response.action,
  };
  switch (response.code) {
    case 'AUTH_INVALID_API_KEY':
    case 'ERR_AUTH_FAILED':
      return new AuthFailedError(options);
    case 'DUPLICATE_RESOURCE':
      return new AlreadySavedError(
        extractDuplicateResourceId(response.detail || response.message) ??
          undefined,
        options
      );
    case 'ERR_NETWORK':
      return new NetworkErrorCode(options);
    case 'ERR_TIMEOUT':
      return new TimeoutErrorCode(options);
    case 'AI_KEY_NOT_CONFIGURED':
    case 'AI_KEY_INVALID':
    case 'AI_RATE_LIMITED':
    case 'AI_TIMEOUT':
    case 'AI_SERVICE_ERROR':
    case 'AI_EXTRACTION_FAILED':
      return new ExtensionError(response.code, options);
    default:
      return null;
  }
}
