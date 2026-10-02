import { warn } from './logger';
import {
  API_ENDPOINTS,
  type JobLeadListResponse,
  type JobLeadListItem,
  type JobLeadResponse,
  fetchJson,
  TimeoutError,
  truncateText,
} from './api-core';
import { NoSettingsError } from './errors';

export async function saveJobLead(
  url: string,
  text: string = ''
): Promise<JobLeadResponse> {
  return fetchJson<JobLeadResponse>(
    API_ENDPOINTS.JOB_LEADS,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, text: truncateText(text) }),
    },
    { allowStructuredErrors: true }
  );
}

export async function getJobLead(id: string): Promise<JobLeadResponse> {
  return fetchJson<JobLeadResponse>(`${API_ENDPOINTS.JOB_LEADS}/${id}`, {
    method: 'GET',
  });
}

export async function extractJobLead(
  id: string,
  expectedRevision: number
): Promise<JobLeadResponse> {
  return fetchJson<JobLeadResponse>(
    `${API_ENDPOINTS.JOB_LEADS}/${id}/extract`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Time-Zone': Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      body: JSON.stringify({ expected_revision: expectedRevision }),
    },
    { allowStructuredErrors: true }
  );
}

export async function checkExistingLead(
  url: string
): Promise<JobLeadListItem | null> {
  try {
    const data = await fetchJson<JobLeadListResponse>(
      `${API_ENDPOINTS.JOB_LEADS}?search=${encodeURIComponent(url)}`,
      { method: 'GET' }
    );
    return data.items.find((lead) => lead.url === url) || null;
  } catch (error) {
    if (error instanceof TimeoutError || error instanceof NoSettingsError)
      throw error;
    warn('API', 'Failed to check existing lead:', error);
    return null;
  }
}
