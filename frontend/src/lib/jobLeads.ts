import { t, language } from '@/lib/i18n';
import { errorMessage } from './errorMessage';
import { isAxiosError } from 'axios';
import { invalidateEvidenceQueries } from './queryClient';
import api, { withAxiosTimeZoneHeaders } from './api';
import type { Application, JobLead } from './types';
import { queryParams, type JobQuery, type JobFields } from './apiV030';

interface JobLeadsParams extends JobQuery {
  page?: number;
  per_page?: number;
  search?: string;
  status?: string;
  source?: string;
  sort?: 'newest' | 'oldest';
}

interface JobLeadsListResponse {
  items: JobLeadListItem[];
  total: number;
  page: number;
  per_page: number;
}

interface JobLeadSourcesResponse {
  sources: string[];
}

/**
 * List job leads for the authenticated user with pagination and filtering.
 */
export async function getJobLeads(
  params: JobLeadsParams = {}
): Promise<JobLeadsListResponse> {
  const response = await api.get('/api/job-leads', {
    params: queryParams(params),
  });
  return response.data;
}

/**
 * Get a single job lead by ID.
 */
export async function getJobLead(id: string): Promise<JobLead> {
  const response = await api.get(`/api/job-leads/${id}`);
  return response.data;
}

export async function getJobLeadSources(): Promise<string[]> {
  const response = await api.get<JobLeadSourcesResponse>(
    '/api/job-leads/sources'
  );
  return response.data.sources;
}

/**
 * Delete a job lead by ID.
 */
export async function deleteJobLead(id: string): Promise<void> {
  await api.delete(`/api/job-leads/${id}`);
}

export type JobLeadListItem = Pick<
  JobLead,
  | 'id'
  | 'decision'
  | 'priority'
  | 'deadline'
  | 'status'
  | 'title'
  | 'company'
  | 'url'
  | 'location'
  | 'salary_min'
  | 'salary_max'
  | 'salary_currency'
  | 'source'
  | 'scraped_at'
  | 'converted_to_application_id'
  | 'error_message'
>;

export interface JobLeadCreate extends JobFields {
  url?: string | null;
  title?: string;
  company?: string | null;
  location?: string | null;
  text?: string;
  html?: string;
}

export type JobLeadUpdate = Partial<
  Pick<
    JobLead,
    | 'title'
    | 'company'
    | 'description'
    | 'location'
    | 'salary_min'
    | 'salary_max'
    | 'salary_currency'
    | 'recruiter_name'
    | 'recruiter_title'
    | 'recruiter_linkedin_url'
    | 'requirements_must_have'
    | 'requirements_nice_to_have'
    | 'skills'
    | 'years_experience_min'
    | 'years_experience_max'
    | 'source'
    | 'posted_date'
  >
> &
  JobFields & {
    decision?: JobLead['decision'];
    expected_revision: number;
    recruiter_contact_id?: string | null;
  };

export interface JobLeadExtractRequest {
  expected_revision: number;
  restart_processing?: boolean;
}

export async function createJobLead(body: JobLeadCreate): Promise<JobLead> {
  const response = await api.post('/api/job-leads', body);
  return response.data;
}

export async function updateJobLead(
  id: string,
  body: JobLeadUpdate
): Promise<JobLead> {
  const response = await api.patch(`/api/job-leads/${id}`, body);
  return response.data;
}

export async function extractJobLead(
  id: string,
  body: JobLeadExtractRequest
): Promise<JobLead> {
  const response = await api.post(`/api/job-leads/${id}/extract`, {
    ...body,
    language: language(),
  });
  return response.data;
}

export async function retryJobLead(
  id: string,
  body: JobLeadExtractRequest
): Promise<JobLead> {
  const response = await api.post(`/api/job-leads/${id}/retry`, {
    ...body,
    language: language(),
  });
  return response.data;
}

export function jobLeadError(error: unknown): {
  message: string;
  id?: string;
  conflict: boolean;
} {
  const detail = isAxiosError(error) ? error.response?.data?.detail : null;
  return {
    message: isAxiosError(error)
      ? errorMessage(error.response?.data, error.response?.status)
      : t('Request failed'),
    id: typeof detail?.id === 'string' ? detail.id : undefined,
    conflict: isAxiosError(error) && error.response?.status === 409,
  };
}

/**
 * Convert a job lead to an application.
 */
export async function convertToApplication(id: string): Promise<Application> {
  const response = await api.post<Application>(
    `/api/job-leads/${id}/convert`,
    {},
    {
      headers: withAxiosTimeZoneHeaders(),
    }
  );
  invalidateEvidenceQueries();
  return response.data;
}
