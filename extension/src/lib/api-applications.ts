import { warn } from './logger';
import { buildUrl } from './url';
import {
  API_ENDPOINTS,
  type ApplicationExtractRequest,
  type ApplicationListResponse,
  type ApplicationResponse,
  type StatusResponse,
  createTimeoutController,
  fetchJson,
  getConfiguredSettings,
  truncateText,
} from './api-core';

export async function checkExistingApplication(url: string): Promise<ApplicationResponse | null> {
  const settings = await getConfiguredSettings().catch(() => null);
  if (!settings) return null;
  const { controller, timeoutId } = createTimeoutController();
  try {
    const response = await fetch(
      `${buildUrl(settings.appUrl, API_ENDPOINTS.APPLICATIONS)}?url=${encodeURIComponent(url)}`,
      { method: 'GET', headers: { 'X-API-Key': settings.apiKey }, signal: controller.signal }
    );
    if (!response.ok) {
      if (response.status === 401) return null;
      warn('API', 'Failed to check existing application:', response.status);
      return null;
    }
    const data: ApplicationListResponse = await response.json();
    return data.items.find((app) => app.job_url === url) || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return null;
    warn('API', 'Error checking existing application:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function convertLeadToApplication(leadId: string): Promise<ApplicationResponse> {
  return fetchJson<ApplicationResponse>(`${API_ENDPOINTS.JOB_LEADS}/${leadId}/convert`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function createApplicationFromJob(data: {
  job_title: string;
  company: string;
  status_id: string;
  job_url?: string;
  job_description?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  applied_at?: string;
}): Promise<ApplicationResponse> {
  return fetchJson<ApplicationResponse>(API_ENDPOINTS.APPLICATIONS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_title: data.job_title,
      company: data.company,
      status_id: data.status_id,
      job_url: data.job_url || null,
      job_description: data.job_description || null,
      salary_min: data.salary_min || null,
      salary_max: data.salary_max || null,
      salary_currency: data.salary_currency || null,
      applied_at: data.applied_at || new Date().toISOString().split('T')[0],
    }),
  });
}

export async function extractApplication(data: ApplicationExtractRequest): Promise<ApplicationResponse> {
  return fetchJson<ApplicationResponse>(`${API_ENDPOINTS.APPLICATIONS}/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: data.url,
      status_id: data.status_id,
      applied_at: data.applied_at || new Date().toISOString().split('T')[0],
      text: data.text ? truncateText(data.text) : undefined,
    }),
  }, { allowStructuredErrors: true });
}

export async function getStatuses(): Promise<StatusResponse[]> {
  return fetchJson<StatusResponse[]>(API_ENDPOINTS.STATUSES, { method: 'GET' });
}
