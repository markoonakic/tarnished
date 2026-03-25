import { buildUrl } from './url';
import {
  API_ENDPOINTS,
  ApiClientError,
  AuthenticationError,
  createTimeoutController,
  fetchJson,
  getConfiguredSettings,
  NetworkError,
  type UserProfileResponse,
  TimeoutError,
} from './api-core';

export async function getProfile(): Promise<UserProfileResponse> {
  return fetchJson<UserProfileResponse>(API_ENDPOINTS.PROFILE, { method: 'GET' });
}

export async function testConnection(): Promise<boolean> {
  const settings = await getConfiguredSettings();
  const { controller, timeoutId } = createTimeoutController();
  try {
    const response = await fetch(
      `${buildUrl(settings.appUrl, API_ENDPOINTS.JOB_LEADS)}?per_page=1`,
      { method: 'GET', headers: { 'X-API-Key': settings.apiKey }, signal: controller.signal }
    );
    if (!response.ok) {
      if (response.status === 401) throw new AuthenticationError('Invalid API key.');
      throw new NetworkError(`Server returned status ${response.status}`);
    }
    return true;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new TimeoutError('Connection test timed out.');
    throw new NetworkError(error instanceof Error ? error.message : 'Connection failed');
  } finally {
    clearTimeout(timeoutId);
  }
}
