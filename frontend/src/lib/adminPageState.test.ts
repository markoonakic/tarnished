import { describe, expect, it } from 'vitest';

import {
  buildAISettingsUpdatePayload,
  getAISettingsFormValues,
  normalizeAdminUserSearchQuery,
} from './adminPageState';

describe('admin page state helpers', () => {
  it('normalizes admin user search queries for backend requests', () => {
    expect(normalizeAdminUserSearchQuery('  alice@example.com  ')).toBe(
      'alice@example.com'
    );
    expect(normalizeAdminUserSearchQuery('   ')).toBeUndefined();
  });

  it('hydrates ai settings form values without exposing the stored key', () => {
    expect(
      getAISettingsFormValues({
        litellm_model: 'gpt-4o',
        litellm_api_key_masked: '...1234',
        litellm_base_url: 'https://api.example.com',
        is_configured: true,
      })
    ).toEqual({
      model: 'gpt-4o',
      apiKey: '',
      baseUrl: 'https://api.example.com',
    });
  });

  it('only includes a new api key when an admin entered one', () => {
    expect(
      buildAISettingsUpdatePayload({
        model: 'gpt-4o',
        apiKey: '',
        baseUrl: '',
      })
    ).toEqual({
      litellm_model: 'gpt-4o',
      litellm_base_url: null,
    });
  });

  it('includes the api key when an admin explicitly changed it', () => {
    expect(
      buildAISettingsUpdatePayload({
        model: '',
        apiKey: 'sk-test',
        baseUrl: 'https://api.example.com',
      })
    ).toEqual({
      litellm_model: null,
      litellm_base_url: 'https://api.example.com',
      litellm_api_key: 'sk-test',
    });
  });
});
