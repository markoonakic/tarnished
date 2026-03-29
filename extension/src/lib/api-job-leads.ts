import { warn } from './logger';
import {
  API_ENDPOINTS,
  type JobLeadListResponse,
  type JobLeadResponse,
  DuplicateLeadError,
  extractExistingId,
  fetchJson,
  AuthenticationError,
  createTimeoutController,
  parseErrorResponse,
  truncateText,
  TimeoutError,
  getConfiguredSettings,
} from './api-core';
import { buildUrl } from './url';

export async function saveJobLead(
  url: string,
  text: string
): Promise<JobLeadResponse> {
  try {
    return await fetchJson<JobLeadResponse>(
      API_ENDPOINTS.JOB_LEADS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, text: truncateText(text) }),
      },
      { allowStructuredErrors: true }
    );
  } catch (error) {
    if (
      error instanceof AuthenticationError ||
      error instanceof DuplicateLeadError
    )
      throw error;
    if ((error as { status?: number })?.status === 409) {
      const existingId = extractExistingId((error as Error).message);
      throw new DuplicateLeadError((error as Error).message, existingId);
    }
    throw error;
  }
}

export async function checkExistingLead(
  url: string
): Promise<JobLeadResponse | null> {
  const settings = await getConfiguredSettings();
  const { controller, timeoutId } = createTimeoutController();
  try {
    const response = await fetch(
      `${buildUrl(settings.appUrl, API_ENDPOINTS.JOB_LEADS)}?search=${encodeURIComponent(url)}`,
      {
        method: 'GET',
        headers: { 'X-API-Key': settings.apiKey },
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      if (response.status === 401) return null;
      const error = await parseErrorResponse(response);
      warn('API', 'Failed to check existing lead:', error.message);
      return null;
    }
    const data: JobLeadListResponse = await response.json();
    return data.items.find((lead) => lead.url === url) || null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new TimeoutError();
    warn('API', 'Error checking existing lead:', error);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
