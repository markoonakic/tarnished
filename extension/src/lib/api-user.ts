import { API_ENDPOINTS, fetchJson, type UserProfileResponse } from './api-core';
import type { UserSettings } from './theme';

export async function getProfile(): Promise<UserProfileResponse> {
  return fetchJson<UserProfileResponse>(API_ENDPOINTS.PROFILE, {
    method: 'GET',
  });
}

export async function getUserSettings(): Promise<UserSettings> {
  return fetchJson<UserSettings>(API_ENDPOINTS.USER_SETTINGS, {
    method: 'GET',
  });
}
