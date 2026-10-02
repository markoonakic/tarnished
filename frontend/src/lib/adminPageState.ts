import type { AISettingsResponse, AISettingsUpdate } from './aiSettings';
export type AISettingsFormValues = {
  model: string;
  apiKey: string;
  baseUrl: string;
};

export function normalizeAdminUserSearchQuery(
  query: string
): string | undefined {
  const normalizedQuery = query.trim();
  return normalizedQuery || undefined;
}

export function getAISettingsFormValues(
  settings: Pick<AISettingsResponse, 'litellm_model'> | null
): AISettingsFormValues {
  return {
    model: settings?.litellm_model || '',
    apiKey: '',
    baseUrl: '',
  };
}

const nonsecretFields = [
  'litellm_model',
  'text_protocol',
  'text_enabled',
  'text_keyless',
  'speech_enabled',
  'speech_keyless',
  'speech_provider',
  'speech_model',
] as const;

export type AISettingsBaseline = Pick<
  AISettingsResponse,
  (typeof nonsecretFields)[number]
>;

export function buildAISettingsUpdatePayload(
  values: AISettingsUpdate,
  baseline: AISettingsBaseline
): AISettingsUpdate {
  const payload = { ...values };
  // Compare against this form's hydration, never a later account-list refresh.
  // Write-only fields retain explicit replacement/clear intent.
  for (const key of nonsecretFields) {
    if (payload[key] === baseline[key]) delete payload[key];
  }
  return payload;
}
