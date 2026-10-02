import api from './api';

export interface Capability {
  enabled: boolean;
  provider: string | null;
  model: string | null;
  configuration_status:
    'disabled' | 'incomplete' | 'unsupported' | 'configured';
  configuration_revision: string;
  verified: false;
  dispatch_supported: boolean;
  available: boolean;
  external_processing: string;
  input_disclosure: string;
  message: string;
}

export interface AISettingsResponse {
  litellm_model: string | null;
  litellm_api_key_masked: string | null;
  litellm_base_url: null;
  litellm_endpoint_configured: boolean;
  is_configured: boolean;
  text_protocol: 'chat_completions' | 'responses';
  text_enabled: boolean;
  text_keyless: boolean;
  speech_enabled: boolean;
  speech_keyless: boolean;
  speech_provider: string | null;
  speech_model: string | null;
  speech_endpoint_configured: boolean;
  speech_api_key_configured: boolean;
  text: Capability;
  speech: Capability;
}

export interface AISettingsUpdate {
  litellm_model?: string | null;
  litellm_api_key?: string | null;
  litellm_base_url?: string | null;
  text_protocol?: 'chat_completions' | 'responses';
  text_enabled?: boolean;
  text_keyless?: boolean;
  speech_enabled?: boolean;
  speech_keyless?: boolean;
  speech_provider?: string | null;
  speech_model?: string | null;
  speech_endpoint?: string | null;
  speech_api_key?: string | null;
}

/** Explicit cache inspection, never inference or model download. */
export async function getLocalSpeechStatus(): Promise<{
  status: string;
  message: string;
  installed: string[];
}> {
  const response = await api.get('/api/admin/ai-settings/local-speech-status');
  return response.data;
}

/** Stored endpoints and credentials are never returned, even to administrators. */
export async function getAISettings(): Promise<AISettingsResponse> {
  const response = await api.get('/api/admin/ai-settings');
  return response.data;
}

/** Only provided fields change; null explicitly clears a nullable field. */
export async function updateAISettings(
  data: AISettingsUpdate
): Promise<AISettingsResponse> {
  const response = await api.put('/api/admin/ai-settings', data);
  return response.data;
}

export async function getAICapabilities(): Promise<{
  text: Capability;
  speech: Capability;
}> {
  const response = await api.get('/api/ai-capabilities');
  return response.data;
}
