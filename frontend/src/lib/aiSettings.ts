import api from './api';

export interface AISettingsResponse {
  litellm_model: string | null;
  litellm_api_key_masked: string | null;
  litellm_base_url: string | null;
  is_configured: boolean;
}

interface AISettingsUpdate {
  litellm_model?: string | null;
  litellm_api_key?: string | null;
  litellm_base_url?: string | null;
}

/**
 * Get current AI/LiteLLM settings.
 * API key is masked for security.
 */
export async function getAISettings(): Promise<AISettingsResponse> {
  const response = await api.get('/api/admin/ai-settings');
  return response.data;
}

/**
 * Update AI/LiteLLM settings.
 * Only provided fields will be updated.
 * Pass empty string to clear a field.
 */
export async function updateAISettings(data: AISettingsUpdate): Promise<AISettingsResponse> {
  const response = await api.put('/api/admin/ai-settings', data);
  return response.data;
}
