export const API_ERROR_NAME_TO_CODE = {
  AuthenticationError: 'ERR_AUTH_FAILED',
  DuplicateLeadError: 'ERR_ALREADY_SAVED',
  TimeoutError: 'ERR_TIMEOUT',
  NetworkError: 'ERR_NETWORK',
  ServerError: 'ERR_NETWORK',
  ApiClientError: 'ERR_EXTRACTION_FAILED',
} as const;

export function mapApiErrorNameToCode(
  errorName: string
): (typeof API_ERROR_NAME_TO_CODE)[keyof typeof API_ERROR_NAME_TO_CODE] | null {
  return API_ERROR_NAME_TO_CODE[
    errorName as keyof typeof API_ERROR_NAME_TO_CODE
  ] ?? null;
}

export function extractDuplicateResourceId(message: string): string | null {
  const match = message.match(/ID:\s*([a-z0-9-]+)/i);
  return match?.[1] ?? null;
}
