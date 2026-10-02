import { warn } from './logger';
import {
  API_ENDPOINTS,
  type ApplicationListResponse,
  type ApplicationResponse,
  fetchJson,
} from './api-core';

export async function checkExistingApplication(
  url: string
): Promise<ApplicationResponse | null> {
  try {
    const data = await fetchJson<ApplicationListResponse>(
      `${API_ENDPOINTS.APPLICATIONS}?url=${encodeURIComponent(url)}`,
      { method: 'GET' }
    );
    return data.items.find((app) => app.job_url === url) || null;
  } catch (error) {
    warn('API', 'Failed to check existing application:', error);
    return null;
  }
}

export async function convertLeadToApplication(
  leadId: string
): Promise<ApplicationResponse> {
  return fetchJson<ApplicationResponse>(
    `${API_ENDPOINTS.JOB_LEADS}/${leadId}/convert`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }
  );
}
