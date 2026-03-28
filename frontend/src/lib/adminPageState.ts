import type { AISettingsResponse } from './aiSettings';
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
  settings: AISettingsResponse | null
): AISettingsFormValues {
  return {
    model: settings?.litellm_model || '',
    apiKey: '',
    baseUrl: settings?.litellm_base_url || '',
  };
}

export function buildAISettingsUpdatePayload(values: AISettingsFormValues): {
  litellm_model?: string | null;
  litellm_api_key?: string | null;
  litellm_base_url?: string | null;
} {
  const payload: {
    litellm_model?: string | null;
    litellm_api_key?: string | null;
    litellm_base_url?: string | null;
  } = {
    litellm_model: values.model || null,
    litellm_base_url: values.baseUrl || null,
  };

  if (values.apiKey) {
    payload.litellm_api_key = values.apiKey;
  }

  return payload;
}
