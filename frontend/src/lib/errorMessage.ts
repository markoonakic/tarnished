import { t } from './i18n';

const codes = [
  'settings_changed',
  'transcript_attachment_replacement',
  'create_content_changed',
  'round_time_zone_changed',
  'no_audio_track',
  'report_configuration',
  'report_connection',
  'report_timeout',
  'report_provider_auth',
  'report_provider_rate_limit',
  'report_provider_request',
  'report_provider_unavailable',
  'report_provider_response_invalid',
  'report_provider_output_limit',
  'report_report_grounding',
  'report_unknown',
  'invalid_request',
  'authentication_required',
  'access_denied',
  'not_found',
  'conflict',
  'too_large',
  'validation_error',
  'rate_limited',
  'server_error',
  'service_error',
  'service_unavailable',
  'service_timeout',
  'request_failed',
  'invalid_credentials',
  'inactive_account',
  'incorrect_password',
  'email_in_use',
  'application_not_found',
  'lead_not_found',
  'round_not_found',
  'queue_full',
  'AI_KEY_NOT_CONFIGURED',
  'AI_TIMEOUT',
  'AI_SERVICE_ERROR',
  'AI_EXTRACTION_FAILED',
  'DUPLICATE_RESOURCE',
] as const;
const statusCodes: Record<number, (typeof codes)[number]> = {
  400: 'invalid_request',
  401: 'authentication_required',
  403: 'access_denied',
  404: 'not_found',
  409: 'conflict',
  413: 'too_large',
  422: 'validation_error',
  429: 'rate_limited',
  500: 'server_error',
  502: 'service_error',
  503: 'service_unavailable',
  504: 'service_timeout',
};

export function errorMessage(payload: unknown, status?: number): string {
  const object =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const detail =
    object.detail && typeof object.detail === 'object'
      ? (object.detail as Record<string, unknown>)
      : {};
  const code = object.code ?? detail.code;
  const known =
    codes.find((value) => value === code) ??
    (status ? statusCodes[status] : undefined) ??
    'request_failed';
  return t(`error.${known}`);
}
