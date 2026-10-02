import { describe, expect, it } from 'vitest';

import {
  buildAISettingsUpdatePayload,
  getAISettingsFormValues,
  normalizeAdminUserSearchQuery,
} from './adminPageState';

const baseline = {
  litellm_model: 'openai/gpt-4o',
  text_protocol: 'chat_completions' as const,
  text_enabled: true,
  text_keyless: false,
  speech_enabled: false,
  speech_keyless: false,
  speech_provider: null,
  speech_model: null,
};

describe('admin page state helpers', () => {
  it('normalizes admin user search queries for backend requests', () => {
    expect(normalizeAdminUserSearchQuery('  alice@example.com  ')).toBe(
      'alice@example.com'
    );
    expect(normalizeAdminUserSearchQuery('   ')).toBeUndefined();
  });

  it('hydrates ai settings form values without exposing the stored key', () => {
    expect(getAISettingsFormValues({ litellm_model: 'gpt-4o' })).toEqual({
      model: 'gpt-4o',
      apiKey: '',
      baseUrl: '',
    });
  });

  it('omits every unchanged field against its own baseline', () => {
    expect(buildAISettingsUpdatePayload(baseline, baseline)).toEqual({});
  });

  it('keeps explicit changes and write-only replacements and clears', () => {
    expect(
      buildAISettingsUpdatePayload(
        {
          ...baseline,
          litellm_model: null,
          text_protocol: 'responses',
          text_enabled: false,
          speech_model: 'whisper-1',
          litellm_api_key: 'synthetic-key',
          litellm_base_url: 'https://example.invalid',
          speech_api_key: null,
          speech_endpoint: null,
        },
        baseline
      )
    ).toEqual({
      litellm_model: null,
      text_protocol: 'responses',
      text_enabled: false,
      speech_model: 'whisper-1',
      litellm_api_key: 'synthetic-key',
      litellm_base_url: 'https://example.invalid',
      speech_api_key: null,
      speech_endpoint: null,
    });
  });
});
